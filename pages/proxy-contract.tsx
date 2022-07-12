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
  Text,
  Checkbox
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
import Transaction, { Box as eUTXOBox, SigmaType, ExplorerBox } from 'ergoscript';
import { updateEdge } from 'react-flow-renderer';

const { Long, Int, CollByte } = SigmaType;

const swapArrayLocs = function (arr, index1, index2) {
  const temp = arr[index1];

  arr[index1] = arr[index2];
  arr[index2] = temp;
};

export const baseContract = `
{
  // dApp-specific part ensuring that user will receive what he is paying for
  val properFundUsage = {
    val userOut = OUTPUTS(1)
    userOut.propositionBytes == fromBase64("$userAddress") && // user must be the recipient
      userOut.tokens(0)._1 == fromBase64("$scTokenId") && // user must receive SigmaUSD
      userOut.tokens(0)._2 >= $scAmountL && // the amount of SigmaUSD must be at least what user is paying for
      HEIGHT < $timestampL // this part is always true (timestamp is the unix-timestamp at the time of the request), it will cause compiled address to differ everytime
  }

  // ensuring dApp integrity is preserved - any dApp specific condition to ensure designed procedures won't be violated
  val UIFeeOk = OUTPUTS(2).propositionBytes == fromBase64("$implementor") && OUTPUTS.size == 4 // UI fee must go to UI devs not any random person who assembles the transaction
  val properBank = OUTPUTS(0).tokens(2)._1 == fromBase64("$bankNFT") // the real bank box of the sigmaUSD protocol must be used so not any random person can behave as the bank box
  val dAppWorksFine = properFundUsage && UIFeeOk && properBank

  // in any case, whether assembler refuses to execute the request or the request fails for any reason, user must be able to get back his funds
  val returnFunds = { 
    val total = INPUTS.fold(0L, {(x:Long, b:Box) => x + b.value}) - $returnFee // only refund transactions's fee must be deducted from user's funds

    allOf(Coll(
      OUTPUTS(0).value >= total && OUTPUTS(0).propositionBytes == fromBase64("$userAddress"), // user must receive the appropriate amount
      (PK("$assemblerNodeAddr") || HEIGHT > $refundHeightThreshold),// either dApp-specific node can return user's funds or some time (block) has to be passed first. This is useful for many reasons.
      OUTPUTS.size == 2 // only refund box and transaction fee box is needed
    ))   
  }

  sigmaProp(dAppWorksFine || returnFunds) // either dApp must work as it is supposed to or user's funds must be returned
}
`;

async function listTokens() {
  // await ergoConnector.nautilus.connect();

  return await loadTokensFromWallet();
}

function buildRenderedValue(doc: {value: string, isAddress: boolean, isNumber: boolean } = { value: '', isAddress: false, isNumber: false }) {
  let renderedValue: string | number;
  const val = doc.value;

  if (doc.isNumber) {
    renderedValue = val;
  } else if (doc.isAddress) {
    try {
      renderedValue = Buffer.from(new Address(val).ergoTree, 'hex').toString('base64');
    } catch(e) {
      renderedValue = '<not valid>'
    }
  } else {
    renderedValue = Buffer.from(val, 'hex').toString('base64');
  }

  return renderedValue;
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
  const [isSendingFunds, setIsSendingFunds] = useState(false);
  const [isMakingSwap, setIsMakingSwap] = useState(false);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [txFeedback, setTxFeedback] = useState(false);
  const [txHash, setTxHash] = useState(false);
  const [variables, setVariables] = useState([]);
  const [swapPrice, setSwapPrice] = useState(0.02);
  const [rentDays, setRentDays] = useState(1);
  const [variableMap, setVariableMap] = useState<any>({
    '$userAddress': { value: '9hu1CHr4MBd7ikUjag59AZ9VHaacvTRz34u58eoLp7ZF3d1oSXk', isAddress: true, isNumber: false },
    '$scTokenId': { value: '03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04', isAddress: false, isNumber: false },
    '$scAmountL': { value: '100000L', isAddress: false, isNumber: true },
    '$timestampL': { value: '3333333L', isAddress: false, isNumber: true },
    '$implementor': { value: '9hu1CHr4MBd7ikUjag59AZ9VHaacvTRz34u58eoLp7ZF3d1oSXk', isAddress: true, isNumber: false },
    '$bankNFT': { value: '0fb7067499b8cbc8ac343d694ab817a3c750b641cf4e9aee73cceca2a7d7a770', isAddress: false, isNumber: false },
    '$returnFee': { value: 12121, isAddress: false, isNumber: true },
    '$assemblerNodeAddr': { value: '9hu1CHr4MBd7ikUjag59AZ9VHaacvTRz34u58eoLp7ZF3d1oSXk', isAddress: false, isNumber: true },
    '$refundHeightThreshold': { value: 12232323, isAddress: false, isNumber: true },
  });

  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    parseVars(localStorage.getItem('contract') || baseContract);
    async function fetchData() {
      setContract(localStorage.getItem('contract') || baseContract);

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
    handleScriptChanged(localStorage.getItem('contract') || baseContract)
  }, []);

  function handleVarChange(variable: string, value: string ) {
    const doc = variableMap[variable] || { value: '', isNumber: false, isAddress: false };

    doc.value = value;
    setVariableMap({ ...variableMap, [variable]: doc })
    handleScriptChanged(contract)
  }

  function handleVarChecked(variable: string, property: string, value: boolean) {
    const doc = variableMap[variable] || { value: '', isNumber: false, isAddress: false };

    doc[property] = value;
    if (property === 'isNumber' && value === true) {
      doc.isAddress = false;
    }
    setVariableMap({ ...variableMap, [variable]: doc })
    handleScriptChanged(contract)
  }

  function parseVars(contract: string) {
    const matches = contract.match(/\$([a-zA-Z]+)/gm);

    const uniqueMatches = Array.from(new Set(matches));

    setVariables(uniqueMatches);

    return uniqueMatches;
  } 

  async function handleScriptChanged(value: string) {
    const uniqueMatches = parseVars(value)
    setContract(value);
    localStorage.setItem('contract', value);

    const compiledContract = uniqueMatches.reduce((contractVal, variable) => {
      return contractVal.replaceAll(variable, buildRenderedValue(variableMap[variable]))
    }, value)

    let resp;
    const compile = _.debounce(async () => {
      try {
        resp = await p2sNode(`${compiledContract}`);

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

        return resp.address;
      } catch (e) {}
    }, 1000);

    return await compile();
  }

  async function handleSendFunds() {
    setIsSendingFunds(true);

    let unsignedTx;

    const price = swapPrice * NANO_ERG_IN_ERG;

    try {
      const tx = new Transaction([
        {
          funds: {
            ERG: price,
            tokens: [],
          },
          toAddress: contractAddress, // contract address
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      console.error(e);
      alert(e.message);
      setIsMakingSwap(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsSendingFunds(false);
    onOpen();
  }

  async function handleRentToken() {
    setIsMakingSwap(true);

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
          additionalRegisters: {},
        },
        {
          funds: {
            ERG: 0, // will be replaced with minimum during tx building
            tokens: [
              {
                tokenId: '0b7c3cd3145209c6f455e2a0b890195eafcde934e09ca3d54d7972d1f1ce3c44',
                amount: 50,
              }, // have to send ValleyDAO along with the payment
            ],
          },
          toAddress: '9ftUoK8Sn7vWnHvZ48bRfz8oSkZraFDnwe3NmzfvMBf8qEbxavB',
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      console.error(e);
      alert(e.message);
      setIsMakingSwap(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsMakingSwap(false);
    onOpen();
  }

  async function handleEditListingAsOwner() {
    setIsMakingSwap(true);

    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();

    const price = swapPrice * NANO_ERG_IN_ERG;
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
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      alert(e.message);
      setIsMakingSwap(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsMakingSwap(false);
    onOpen();
  }

  async function handleWithdrawToken() {
    // In withdraw token we simply move NFT from SC to our wallet.
    setIsMakingSwap(true);

    if (!tokenToRent) return;

    const changeAddress = await ergo.get_change_address();
    const INPUT_0 = new eUTXOBox(tokenToRent as ExplorerBox);
    const OUTPUT_0 = INPUT_0.sendTo(changeAddress).resetRegisters();

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
          additionalRegisters: {},
        },
      ]);

      unsignedTx = await (await tx.build()).toJSON();
    } catch (e) {
      alert(e.message);
      setIsMakingSwap(false);
    }

    console.log({ unsignedTx });
    setUnsignedTxJson(JSON.stringify(unsignedTx));
    setIsMakingSwap(false);
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
          Interactive Example: Proxy Contract
        </Heading>

        <Flex>
          <Box w="50%">
            <ErgoScriptEditor onChange={handleScriptChanged} height="600px" code={contract} />
            <Text color={'red'}>Danger: assembler and userAddress are hard coded,
            make sure to adjust those values for your case before sending funds!
            Also read the reference article below to understand it better</Text>
            <div className="step-section" data-title="1) Send Funds (0.01 ERG for 100 COMET )">
              How much ERG (erg):{` `}
              <Input
                placeholder="price in Erg"
                value={swapPrice}
                onChange={(e) => setSwapPrice(e.target.value)}
                width={100}
              />
              <Button
                onClick={handleSendFunds}
                width="200px"
                isLoading={isSendingFunds}
                isDisabled={!swapPrice}
                colorScheme="blue"
              >
                Send Funds
              </Button>
            </div>

            <div className="step-section" data-title="2) Send buyer COMET and withdraw ERG">
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

              <Input
                placeholder="price in Erg"
                value={swapPrice}
                onChange={(e) => setSwapPrice(e.target.value)}
                width={100}
              />

              <Button
                onClick={handleRentToken}
                width="200px"
                colorScheme="blue"
                isLoading={isMakingSwap}
                isDisabled={!tokenToRent?.assets[0].name}
              >
                Make a Swap
              </Button>
            </div>


            <div className="step-section" data-title="3) Buyer refund">
              {/* <Menu>
                <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
                  {tokenToRent?.assets[0].name || 'Box to refund'}
                </MenuButton>
                <MenuList>
                  {lockedTokens.map((box) => (
                    <MenuItem onClick={() => setTokenToRent(box)} key={box.boxId}>
                      {box.assets[0]?.name}
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu> */}

              <Button
                onClick={handleEditListingAsOwner}
                width="200px"
                colorScheme="blue"
                isLoading={isMakingSwap}
                isDisabled={!tokenToRent?.assets[0].name}
              >
                Refund
              </Button>
            </div>

            <div className="dapp-footer">
              <Heading as="h3" size="sm" style={{ marginTop: 50 }}>
                References:
              </Heading>
              <ul>
                <li>
                  <a
                    href="https://github.com/ergoplatform/eips/blob/master/eip-0017.md"
                    target={'_blank'}
                    rel="noreferrer"
                  >
                    Proxy contract: eip-0017
                  </a>
                </li>
              </ul>
            </div>
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
            
            <Box mt={5}>
              <Heading as="h3" size="md" mb={5}>Variables</Heading>
              {variables.map((item, key) => {
                const doc = variableMap[item] || { isAddress: false, value: '', isNumber: false }
                const val = doc ? doc.value : '';

                const renderedValue = buildRenderedValue(doc);

                return (
                  <Box key={`var-${key}`} pb={'5'}>
                    <Text>{item}</Text>
                    <Input placeholder='value' width={200} mr={5} value={val} onChange={(e) => handleVarChange(item, e.target.value)}/>
                    <Checkbox checked={doc.isAddress} pr={5} mt={2} onChange={(e) => handleVarChecked(item, 'isAddress', e.target.checked)}>isAddress</Checkbox>
                    <Checkbox checked={doc.isNumber} defaultChecked={doc.isNumber} pr={5} mt={2} onChange={(e) => handleVarChecked(item, 'isNumber', e.target.checked)}>Don't HEX (for numbers and PK value)</Checkbox>

                    <Text>{renderedValue}</Text>
                  </Box>
                )
              }
              )}
            </Box>
          </Box>
        </Flex>
      </Stack>
    </div>
  );
}
