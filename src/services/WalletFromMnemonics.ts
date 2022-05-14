import {
  Address,
  BlockHeaders,
  BoxId,
  BoxValue,
  Contract,
  DataInputs,
  DerivationPath,
  ErgoBoxCandidate,
  ErgoBoxCandidateBuilder,
  ErgoBoxCandidates,
  ErgoBoxes,
  ErgoStateContext,
  ExtSecretKey,
  I64,
  Mnemonic,
  NetworkAddress,
  NetworkPrefix,
  PreHeader,
  SecretKey,
  SecretKeys,
  TxBuilder,
  UnsignedInput, 
  UnsignedInputs, 
  UnsignedTransaction,
  Wallet
} from "ergo-lib-wasm-browser";
import request from "superagent";
import JSONBig from "json-bigint";
import { UnsignedTx } from './connector_types';

export default class SignerWallet {
  private wallet!: Wallet;
  private blockContext!: Object[];

  constructor() {}

  async fromMnemonics(mnemonics: string): Promise<SignerWallet> {
    this.blockContext = await request.get('https://api.ergoplatform.com/api/v1/blocks/headers?limit=10').then(resp => resp.body.items)
    this.wallet = await createWallet(mnemonics, this.blockContext);

    return this;
  }

  sign(unsignedTx: UnsignedTx) : string {
    debugger
    const unspentBoxes = ErgoBoxes.from_boxes_json(unsignedTx.inputs);
    const dataInputBoxes = ErgoBoxes.from_boxes_json(unsignedTx.dataInputs);
    const tx = UnsignedTransaction.from_json(JSONBig.stringify(unsignedTx));
    const signed = this._sign(tx, unspentBoxes, dataInputBoxes);

    return signed.to_json();
  }

  private _sign(
    unsigned: UnsignedTransaction,
    unspentBoxes: ErgoBoxes,
    dataInputBoxes: ErgoBoxes,
  ) {
    const blockHeaders = BlockHeaders.from_json(this.blockContext);
    const preHeader = PreHeader.from_block_header(blockHeaders.get(0));
    const signContext = new ErgoStateContext(preHeader, blockHeaders);
    const signed = this.wallet.sign_transaction(signContext, unsigned, unspentBoxes, dataInputBoxes);
    return signed;
  }
}

async function createWallet(mnemonics: string, context: Object) {
  const seed = Mnemonic.to_seed(
      // "prevent hair cousin critic embrace okay burger choice pilot rice sure clerk absurd patrol tent",
      mnemonics,
      ""
  );

  const blockContext = await request.get('https://api.ergoplatform.com/api/v1/blocks/headers?limit=10').then(resp => resp.body.items)

  // derive the root extended key/secret
  const extendedSecretKey = ExtSecretKey.derive_master(seed);
  // derive the initial secret key, this is the change key and is also the owner of the boxes used as inputs
  const changePath = DerivationPath.from_string("m/44'/429'/0'/0/0");
  const changeSk = extendedSecretKey.derive(changePath);

  console.log(changeSk.public_key().to_address().to_base58(NetworkPrefix.Mainnet));

  const baseAddress = extendedSecretKey.public_key().to_address();

  const blockHeaders = BlockHeaders.from_json(blockContext);
  const preHeader = PreHeader.from_block_header(blockHeaders.get(0));
  const stateCtx = new ErgoStateContext(preHeader, blockHeaders);

  const dlogSecret = SecretKey.dlog_from_bytes(changeSk.secret_key_bytes());
  const secretKeys = new SecretKeys();
  secretKeys.add(dlogSecret);

  const wallet = Wallet.from_secrets(secretKeys);

  return wallet;
}

