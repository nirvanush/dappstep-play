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
import {
  sendToken,
  loadTokensFromWallet,
  currentHeight,
} from '../src/services/GenerateSendFundsTx';
import { sendFunds } from '../src/services/Transaction';
import { checkTx, p2sNode } from '../src/services/helpers';
import {
  encodeHex,
  encodeLongTuple,
  encodeNum,
  encodeByteArray,
  decodeNum,
} from '../src/lib/serializer';
import { get } from '../src/lib/rest';
import styles from '../styles/Home.module.css';
import ErgoScriptEditor from './components/ErgoScriptEditor';
import TransactionPreviewModal from './components/TransactionPreviewModal';
import SignerWallet from '../src/services/WalletFromMnemonics';
import { NANO_ERG_IN_ERG } from '../src/services/constants';
import _, { values } from 'lodash';
import { type } from 'os';

const swapArrayLocs = function (arr, index1, index2) {
  const temp = arr[index1];

  arr[index1] = arr[index2];
  arr[index2] = temp;
};

// rent
//[contractToken, unspentBoxes]
//[updatedContractBox, funds, change, fee]

// update
//[contractToken, unspentBoxes]
//[updatedContractBox, change, fee]

// release
//[contractToken, unspentBoxes]
//[updatedContractBox, change, fee]

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
    // connect to ergo wallet
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
      unsignedTx = await sendFunds({
        funds: {
          ERG: minBoxValue * 2,
          tokens: [{ tokenId: selectedToken.tokenId, amount: 1 }],
        },
        toAddress: resp.address,
        additionalRegisters: {
          R4: await encodeHex(tree), // owner address
          R5: await encodeNum(price.toString()),
          R6: await encodeNum(period.toString()),
        },
      });
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
    // connect to ergo wallet
    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();
    const tree = new Address(changeAddress).ergoTree;
    let unsignedTx;

    // generate unsigned transaction
    try {
      unsignedTx = await sendFunds({
        funds: {
          ERG: parseInt(tokenToRent.additionalRegisters.R5.renderedValue),
          tokens: [],
        },
        toAddress: Address.fromErgoTree(tokenToRent.additionalRegisters.R4.renderedValue).address,
        additionalRegisters: {},
      });
    } catch (e) {
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    const deltaTime = tokenToRent.additionalRegisters.R6.renderedValue;
    // on top of regular send funds tx do some enrichements.
    // this will move to an external package.
    //[contractToken, unspentBoxes]
    tokenToRent.additionalRegisters.R4 = tokenToRent.additionalRegisters.R4.serializedValue;
    tokenToRent.additionalRegisters.R5 = tokenToRent.additionalRegisters.R5.serializedValue;
    tokenToRent.additionalRegisters.R6 = tokenToRent.additionalRegisters.R6.serializedValue;

    unsignedTx.inputs = [Object.assign({}, tokenToRent, { extension: {} }), ...unsignedTx.inputs];
    const newBox = JSON.parse(JSON.stringify(tokenToRent));
    newBox.additionalRegisters.R7 = await encodeHex(tree);

    const endOfRent = new Date().getTime() + parseInt(deltaTime);

    newBox.additionalRegisters.R8 = await encodeNum(endOfRent.toString());
    const resetBox = _.pick(newBox, [
      'additionalRegisters',
      'value',
      'ergoTree',
      'creationHeight',
      'assets',
    ]);

    //[updatedContractBox, funds, change, fee]
    unsignedTx.outputs = [resetBox, ...unsignedTx.outputs];
    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingRentTx(false);
    onOpen();
  }

  async function handleEditListingAsOwner() {
    setIsGeneratingRentTx(true);
    // connect to ergo wallet
    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();

    const price = rentPrice * NANO_ERG_IN_ERG;
    const period = 1000 * 60 * 60 * 24 * rentDays;

    let unsignedTx;

    // generate unsigned transaction
    try {
      unsignedTx = await sendFunds({
        funds: {
          ERG: 0,
          tokens: [],
        },
        toAddress: changeAddress,
        additionalRegisters: {},
      });
    } catch (e) {
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    // on top of regular send funds tx do some enrichements.
    // this will move to an external package.
    //[contractToken, unspentBoxes]
    tokenToRent.additionalRegisters.R4 = tokenToRent.additionalRegisters.R4.serializedValue;
    tokenToRent.additionalRegisters.R5 = tokenToRent.additionalRegisters.R5.serializedValue;
    tokenToRent.additionalRegisters.R6 = tokenToRent.additionalRegisters.R6.serializedValue;

    unsignedTx.inputs = [Object.assign({}, tokenToRent, { extension: {} }), ...unsignedTx.inputs];

    const newBox = JSON.parse(JSON.stringify(tokenToRent));

    newBox.additionalRegisters.R5 = await encodeNum(price.toString());
    newBox.additionalRegisters.R6 = await encodeNum(period.toString());

    const resetBox = _.pick(newBox, [
      'additionalRegisters',
      'value',
      'ergoTree',
      'creationHeight',
      'assets',
    ]);

    //[updatedContractBox, funds, change, fee]
    unsignedTx.outputs = [resetBox, ...unsignedTx.outputs.filter((a) => a.value != 0)];

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsGeneratingRentTx(false);
    onOpen();
  }

  async function handleWithdrawToken() {
    setIsGeneratingRentTx(true);
    // connect to ergo wallet
    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();

    const price = rentPrice * NANO_ERG_IN_ERG;
    const period = 1000 * 60 * 60 * 24 * rentDays;

    let unsignedTx;

    // generate unsigned transaction
    try {
      unsignedTx = await sendFunds({
        funds: {
          ERG: 0,
          tokens: [],
        },
        toAddress: changeAddress,
        additionalRegisters: {},
      });
    } catch (e) {
      alert(e.message);
      setIsGeneratingRentTx(false);
    }

    // on top of regular send funds tx do some enrichements.
    // this will move to an external package.
    //[contractToken, unspentBoxes]
    tokenToRent.additionalRegisters.R4 = tokenToRent.additionalRegisters.R4.serializedValue;
    tokenToRent.additionalRegisters.R5 = tokenToRent.additionalRegisters.R5.serializedValue;
    tokenToRent.additionalRegisters.R6 = tokenToRent.additionalRegisters.R6.serializedValue;
    tokenToRent.additionalRegisters.R7 = tokenToRent.additionalRegisters.R7.serializedValue;
    tokenToRent.additionalRegisters.R8 = tokenToRent.additionalRegisters.R8.serializedValue;

    unsignedTx.inputs = [Object.assign({}, tokenToRent, { extension: {} }), ...unsignedTx.inputs];

    const newBox = JSON.parse(JSON.stringify(tokenToRent));

    newBox.additionalRegisters.R5 = await encodeNum(price.toString());
    newBox.additionalRegisters.R6 = await encodeNum(period.toString());

    const resetBox = _.pick(newBox, [
      'additionalRegisters',
      'value',
      'ergoTree',
      'creationHeight',
      'assets',
    ]);

    resetBox.ergoTree = new Address(changeAddress).ergoTree;
    //[updatedContractBox, funds, change, fee]
    unsignedTx.outputs = [resetBox, ...unsignedTx.outputs.filter((a) => a.value != 0)];

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

class Transaction {
  constructor(objects: Object[]) {

  }
}

// lock token
const boxJSON = {};

enum RegisterTypes {
  Long = 'Long',
  'Coll[Byte]' = 'Coll[Byte]',
  Int = 'Int',
}


const toR = async (type: RegisterTypes, value: any) => {
  switch(type) {
    case RegisterTypes.Long:
      return await encodeNum(value.toString());
    case RegisterTypes.Int:
      return await encodeNum(value.toString(), true);
    case RegisterTypes['Coll[Byte]']:
      const tree = new Address(value).ergoTree;

      return await encodeHex(tree);
    default:
      throw new Error('type does not exist');
  }
}

const tx = new Transaction([
  {
    funds: {
      ERG: 0.001,
      tokens: [{ tokenId: '111', amount: '1'} ],
    },
    toAddress: 'contract address',
    additionalRegisters: {
      R4: await toR(RegisterTypes.Long, 3),
      R5: await toR(RegisterTypes.Long, 4),
      R6: await toR(RegisterTypes['Coll[Byte]'], 'address')
    }
  }
])

class ExplorerInputBox {
  R4: Object;
  constructor({ box: Object }) {
    const D = {
      "boxId": "f55cbdee3916b21e1a71f4cab7c183cda114fb968b6f5d4618ea0e5b7ba675de",
      "transactionId": "4086f0bb0760e1b921594fd0567a238cb9c86c6c3db243601f6c43bfafdd0a77",
      "blockId": "607f001652af37bb5e45a8351ad08cfb60f2250f64d5de3cdf9d3e53191a55b9",
      "value": 200000,
      "creationHeight": 756648,
      "ergoTree": "aaa",
      "assets": [
        {
          "tokenId": "0cd8c9f416e5b1ca9f986a7f10a84191dfb85941619e49e53c0dc30ebf83324b",
          "index": 0,
          "amount": 1,
          "name": "COMET",
          "decimals": 0,
          "type": "EIP-004"
        }
      ],
      "additionalRegisters": {
        "R4": {
          "serializedValue": "0e240008cd03bce97a3de134b1f85afe530caa42b0f8618e7883c4b389bb9f4def5d8245a8c4",
          "sigmaType": "Coll[SByte]",
          "renderedValue": "0008cd03bce97a3de134b1f85afe530caa42b0f8618e7883c4b389bb9f4def5d8245a8c4"
        },
        "R5": {
          "serializedValue": "05808ece1c",
          "sigmaType": "SLong",
          "renderedValue": "30000000"
        },
        "R6": {
          "serializedValue": "0580a43f",
          "sigmaType": "SLong",
          "renderedValue": "518400"
        }
      },
      extension: {}
    }

    const a = _.pick(D, [
      'additionalRegisters',
      'value',
      'ergoTree',
      'creationHeight',
      'assets',
    ])
  }

  toJSON() {
    return {}
  }

  purgeRegisters() {
    delete this.R4;
    delete this.R5;
    delete this.R6;
    delete this.R7;
    delete this.R8;

    return this;
  }

  addRegisters(args: { R4?: string, R5?: string, R6?: string, R7?: string, R8?: string }) {
    if(args.R4) this.R4 = this.rValue(args.R4);

    return this;
  }

  rValue(value: any) {
    return {
      get: async function(type) {
        return [value, type];
      }
    }
  }
}


// rent token
const INPUT_0 = new ExplorerInputBox({ box: boxJSON });
const OUTPUT_0 = new ExplorerInputBox({ box: boxJSON })
  .purgeRegisters()
  .addRegisters({
    R4: INPUT_0.R4.get('Long') + 3,
  })
  .mutate({
    ergoTree: 'address',
  });


const tx = new Transaction([
  [INPUT_0, OUTPUT_0],
  {
    funds: {
      ERG: 2,
      tokens: [],
    },
    toAddress: 'user address',
  },
]).toJSON()


// withdraw token
const tx = new Transaction([
  new ContractBox({box: boxJSON, toAddress: 'address' })
]).toJSON()



INPUTBOX.R4['Long'].get();


