import {
  Button,
  Stack,
  Heading,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Box,
  Flex,
  Input,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { Address, minBoxValue } from '@coinbarn/ergo-ts';
import { loadTokensFromWallet } from '../src/services/GenerateSendFundsTx';
import { checkTx, p2sNode } from '../src/services/helpers';
import { get } from '../src/lib/rest';
import styles from '../styles/Home.module.css';
import ErgoScriptEditor from './components/ErgoScriptEditor';
import TransactionPreviewModal from './components/TransactionPreviewModal';
import SignerWallet from '../src/services/WalletFromMnemonics';
import { NANO_ERG_IN_ERG } from '../src/services/constants';
import _ from 'lodash';
import Transaction from '../src/ergoscript.js/Transaction';
import { Box as eUTXOBox, ExplorerBox, SigmaType } from '../src/ergoscript.js/Box';

const { Long, Int, CollByte } = SigmaType;

const swapArrayLocs = function (arr, index1, index2) {
  const temp = arr[index1];

  arr[index1] = arr[index2];
  arr[index2] = temp;
};

// R4 - Owner address
// R5 - Rent price for the whole period
// R6 - Rent period in timestamp delta (eg: month = 1000 * 60 * 60 * 24 * 30)
// R7 - Renter address
// R8 - Rent end timestamp (rent started timestamp + R6)
const baseContract = `
{  
  val defined = OUTPUTS.size >= 3

  val txSenderAddress = OUTPUTS(OUTPUTS.size - 2).propositionBytes

  val isAmountOk = OUTPUTS(1).value == INPUTS(0).R5[Long].get
  // now check that the locked box was modified correctly
  val isOwnerStillSame = OUTPUTS(0).R4[Coll[Byte]].get == INPUTS(0).R4[Coll[Byte]].get
  val isAmountStillSame = OUTPUTS(0).R5[Long].get == INPUTS(0).R5[Long].get
  val isRentalPeriodSame = OUTPUTS(0).R6[Long].get == INPUTS(0).R6[Long].get
  val gracePeriod = 3600000L
  val timestamp = CONTEXT.preHeader.timestamp
  val leftRange =  timestamp + INPUTS(0).R6[Long].get - gracePeriod
  val rightRange = timestamp + INPUTS(0).R6[Long].get + gracePeriod

  val isRentENDHigher = OUTPUTS(0).R8[Long].isDefined && OUTPUTS(0).R8[Long].get > leftRange
  val isRentENDLower = OUTPUTS(0).R8[Long].isDefined && OUTPUTS(0).R8[Long].get < rightRange
  val isSettingEndTimeInAcceptableRange = isRentENDHigher && isRentENDLower
  
  // adding more registers to that box
  val isSendingFundsToSeller = OUTPUTS(1).propositionBytes == INPUTS(0).R4[Coll[Byte]].get
  val isSettingTheRenter = OUTPUTS(0).R7[Coll[Byte]].isDefined && OUTPUTS(0).R7[Coll[Byte]].get == txSenderAddress
  
  // general purpose stuff
  val isHasRenter = INPUTS(0).R7[Coll[Byte]].isDefined

  val isRentingExpired = INPUTS(0).R8[Long].isDefined && INPUTS(0).R8[Long].get < CONTEXT.preHeader.timestamp
  val isSentByOwner = txSenderAddress == INPUTS(0).R4[Coll[Byte]].get
  val isLegitRentingTx = allOf(Coll(
    isSendingFundsToSeller,
    isSettingTheRenter,
    isSettingEndTimeInAcceptableRange,
    isAmountOk,
    isOwnerStillSame,
    isAmountStillSame,
    isRentalPeriodSame,
  ))
  if (!isHasRenter) {
    if (isSentByOwner) { // cancel listing / edit listing
      val isSettingRenter = OUTPUTS(0).R7[Coll[Byte]].isDefined
      val isSettingRentEnd = OUTPUTS(0).R8[Long].isDefined
      sigmaProp(allOf(Coll(
        isOwnerStillSame,
        !isSettingRenter,
        !isSettingRentEnd
      )))
    } else {
      // renting tx
      sigmaProp(isLegitRentingTx)
    }
  } else {
    if (isSentByOwner) { // rent expired, the owner can clime his token back
      sigmaProp(isRentingExpired)
    } else { // Allow renter to renew before rent over
      val isSentBySameRenter = OUTPUTS(0).R7[Coll[Byte]].get == txSenderAddress
      sigmaProp(isSentBySameRenter && isLegitRentingTx && !isRentingExpired)
    }
  }
}
`;

async function listTokens() {
  // await ergoConnector.nautilus.connect();

  return await loadTokensFromWallet();
}

async function listLockedListings(address: string) {
  if (!address) return [];
  return await get(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${address}`)
    .then((resp) => resp.json())
    .then((resp) => resp.items.filter((item) => item.assets.length > 0));
}

export default function Send() {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState({ tokenId: '', name: '' });
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [lockedTokens, setLockedTokens] = useState([]);
  const [tokenToRent, setTokenToRent] = useState({ assets: [{ name: '' }] });
  const [compileError, setCompileError] = useState('');
  const [contractAddress, setContractAddress] = useState(null);
  const [contract, setContract] = useState('');
  const [unsignedTxJson, setUnsignedTxJson] = useState({});
  const [isGeneratingLockTx, setIsGeneratingLockTx] = useState(false);
  const [isGeneratingRentTx, setIsGeneratingRentTx] = useState(false);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [txFeedback, setTxFeedback] = useState(false);
  const [txHash, setTxHash] = useState(false);

  const [rentPrice, setRentPrice] = useState(0.02);
  const [rentDays, setRentDays] = useState(1);
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    async function fetchData() {
      setContract(baseContract);

      const resp = await p2sNode(`${baseContract}`);
      setContractAddress(resp.address);

      const items = await listLockedListings(resp.address);
      setLockedTokens(items);

      setIsLoadingTokens(true);
      const tokensMap = await listTokens();

      setTokens(Object.values(tokensMap));
      setIsLoadingTokens(false);
    }

    fetchData();
  }, []);

  async function handleScriptChanged(value) {
    setContract(value);
    // localStorage.setItem('contract', value);

    let resp;
    const compile = _.debounce(async () => {
      try {
        resp = await p2sNode(`${value}`);

        if (resp.error) {
          const message = resp.error;

          setCompileError(message);
          setContractAddress(null);
          return;
        }

        setContractAddress(resp.address);
        setCompileError(null);
        const items = await listLockedListings(resp.address);
        setLockedTokens(items);
      } catch (e) {
        // console.log(e.error);
      }
    }, 1000);

    compile();
  }

  async function handleLockAsset() {
    setIsGeneratingLockTx(true);

    let resp;

    try {
      resp = await p2sNode(contract);
    } catch (e) {
      console.log(e.error);
      setCompileError(e.message);
      throw e;
    }

    if (!selectedToken) return;

    let unsignedTx;
    const changeAddress = await ergo.get_change_address();
    const tree = new Address(changeAddress).ergoTree;

    const price = rentPrice * NANO_ERG_IN_ERG;
    const period = 1000 * 60 * 60 * 24 * rentDays;

    try {
      const tx = new Transaction([
        {
          funds: {
            ERG: minBoxValue * 2,
            tokens: [{ tokenId: selectedToken.tokenId, amount: 1 }],
          },
          toAddress: resp.address, // contract address
          changeAddress: changeAddress,
          additionalRegisters: {
            R4: { value: tree, type: CollByte }, // owner address
            R5: { value: price, type: Long },
            R6: { value: period, type: Long },
          },
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      console.error(e);
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingLockTx(false);
    onOpen();
  }

  async function handleRentToken() {
    setIsGeneratingRentTx(true);

    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();
    const tree = new Address(changeAddress).ergoTree;
    let unsignedTx;

    // generate unsigned transaction
    try {
      const INPUT_0 = new eUTXOBox(tokenToRent as ExplorerBox);
      const deltaTime = INPUT_0.R6[Long].get;
      const endOfRent = new Date().getTime() + parseInt(deltaTime);
      const price = INPUT_0.R5[Long].get;

      // as a part of proposed transaction we are "purposing" to add two more registers to the locked box.
      const OUTPUT_0 = INPUT_0.setRegisters({
        R7: { value: tree, type: CollByte },
        R8: { value: endOfRent, type: Long },
      });

      const tx = new Transaction([
        [INPUT_0, OUTPUT_0],
        {
          funds: {
            ERG: parseInt(price),
            tokens: [],
          },
          toAddress: Address.fromErgoTree(INPUT_0.R4[CollByte].get).address,
          changeAddress: changeAddress,
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      console.error(e);
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingRentTx(false);
    onOpen();
  }

  async function handleEditListingAsOwner() {
    setIsGeneratingRentTx(true);

    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();

    const price = rentPrice * NANO_ERG_IN_ERG;
    const period = 1000 * 60 * 60 * 24 * rentDays;

    let unsignedTx;
    const INPUT_0 = new eUTXOBox(tokenToRent as ExplorerBox);
    const OUTPUT_0 = INPUT_0.setRegisters({
      R5: { value: price, type: Long },
      R6: { value: period, type: Long },
    });

    // generate unsigned transaction
    // sending 0 erg with no token helps us to generate fee box + changeBox without fee amount.
    try {
      const tx = new Transaction([
        [INPUT_0, OUTPUT_0],
        {
          funds: {
            ERG: 0,
            tokens: [],
          },
          toAddress: changeAddress,
          changeAddress: changeAddress,
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingRentTx(false);
    onOpen();
  }

  async function handleWithdrawToken() {
    // In withdraw token we simply move NFT from SC to our wallet.
    setIsGeneratingRentTx(true);

    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();
    const INPUT_0 = new eUTXOBox(tokenToRent as ExplorerBox);
    const OUTPUT_0 = INPUT_0.sendTo(changeAddress);

    let unsignedTx;

    // generate unsigned transaction
    // sending 0 erg with no token helps us to generate fee box + changeBox without fee amount.
    try {
      const tx = new Transaction([
        [INPUT_0, OUTPUT_0],
        {
          funds: {
            ERG: 0,
            tokens: [],
          },
          toAddress: changeAddress,
          changeAddress: changeAddress,
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingRentTx(false);
    onOpen();
  }

  async function signAndSubmit(unsignedTx) {
    setIsSubmittingTx(true);

    // const wallet = await new SignerWallet().fromMnemonics('');

    let signedTx;

    try {
      signedTx = await ergo.sign_tx(JSON.parse(unsignedTx));

      // signedTx = wallet.sign(JSON.parse(unsignedTx));
    } catch (e) {
      console.error(e);
      setIsSubmittingTx(false);
      e.info ? setTxFeedback(e.info) : setTxFeedback(e);
      return;
    }

    console.log({ signedTx });

    let txCheckResponse;

    try {
      txCheckResponse = await checkTx(JSON.stringify(signedTx));

      // stupid lazy hack to distinguish between txHash and error message
      if (txCheckResponse.message.length == 64) {
        setTxHash(txCheckResponse.message);
        setTxFeedback(null);
      } else {
        setTxFeedback(txCheckResponse.message);
        setTxHash(null);
      }
    } catch (e) {
      console.log(e);
      console.log(txCheckResponse);
      setIsSubmittingTx(false);
      return;
    }

    // submit tx
    const txHash = await ergo.submit_tx(signedTx);

    console.log(`https://explorer.ergoplatform.com/en/transactions/${txHash}`);
    setIsSubmittingTx(false);
    return txHash;
  }

  return (
    <div className={styles.container}>
      <TransactionPreviewModal
        isOpen={isOpen}
        onClose={onClose}
        isSubmitting={isSubmittingTx}
        feedback={txFeedback}
        txHash={txHash}
        unsignedTx={unsignedTxJson}
        handleSubmit={() => signAndSubmit(unsignedTxJson)}
      />

      <Stack spacing={6}>
        <Heading as="h3" size="lg">
          Interactive Example: Rent NFT
        </Heading>

        <Flex>
          <Box w="50%">
            <ErgoScriptEditor onChange={handleScriptChanged} height="600px" code={contract} />
          </Box>
          <Box w="50%" paddingLeft={10}>
            {compileError && <div className="compile-error">{compileError}</div>}
            {contractAddress && (
              <div>
                <h5>Contract Address - {lockedTokens.length} boxes locked</h5>
                <a
                  href={`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${contractAddress}`}
                  target="_blank"
                  style={{ color: 'blue', textDecoration: 'underline' }}
                  rel="noreferrer"
                >
                  {contractAddress}
                </a>
              </div>
            )}
          </Box>
        </Flex>
      </Stack>

      <div className="step-section">
        <Menu>
          <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
            {selectedToken?.name || 'Select token'}
          </MenuButton>
          {!!tokens.length && !selectedToken?.name && '<-- select token first'}
          <MenuList>
            {tokens.map((token) => (
              <MenuItem onClick={() => setSelectedToken(token)} key={token.tokenId}>
                {token.name}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </div>

      <div className="step-section" data-title="1) List asset for rent">
        Rent price (erg):{` `}
        <Input
          placeholder="price in Erg"
          value={rentPrice}
          onChange={(e) => setRentPrice(e.target.value)}
          width={100}
        />
        Days:{` `}
        <Input
          placeholder="days of renting"
          value={rentDays}
          onChange={(e) => setRentDays(e.target.value)}
          width={90}
        />
        <Button
          onClick={handleLockAsset}
          width="200px"
          isLoading={isLoadingTokens || isGeneratingLockTx}
          isDisabled={!selectedToken.name || !rentDays || !rentPrice}
          colorScheme="blue"
        >
          List Asset
        </Button>
      </div>

      <div className="step-section" data-title="2) Rent asset">
        <Menu>
          <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
            {tokenToRent?.assets[0].name || 'Select token to rent'}
          </MenuButton>
          <MenuList>
            {lockedTokens.map((box) => (
              <MenuItem onClick={() => setTokenToRent(box)} key={box.boxId}>
                {box.assets[0]?.name}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>

        <Button
          onClick={handleRentToken}
          width="200px"
          colorScheme="blue"
          isLoading={isGeneratingRentTx}
          isDisabled={!tokenToRent?.assets[0].name}
        >
          Rent token
        </Button>
      </div>

      <div className="step-section" data-title="3) Edit listing as an owner">
        <Button
          onClick={handleEditListingAsOwner}
          width="200px"
          colorScheme="blue"
          isLoading={isGeneratingRentTx}
          isDisabled={!tokenToRent?.assets[0].name}
        >
          Edit listing
        </Button>
      </div>

      <div
        className="step-section"
        data-title="4) Withdraw (if not rented or rent period has expired)"
      >
        <Button
          onClick={handleWithdrawToken}
          width="200px"
          colorScheme="blue"
          isLoading={isGeneratingRentTx}
          isDisabled={!tokenToRent?.assets[0].name}
        >
          Withdraw listing
        </Button>
      </div>
      <div className="dapp-footer">
        <Heading as="h3" size="sm" style={{ marginTop: 50 }}>
          References:
        </Heading>
        {/* <ul>
          <li>
            <a
              href="https://github.com/ergoplatform/ergoscript-by-example/blob/main/pinLockContract.md"
              target={'_blank'}
              rel="noreferrer"
            >
              Ergoscript by example: Pin lock contract
            </a>
          </li>
        </ul> */}
      </div>
    </div>
  );
}
