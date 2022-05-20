import { Balance, Asset, UtxoBox, dataInputsType } from './types';
import { Address } from 'ergo-lib-wasm-browser';
import { currentHeight, loadTokensFromWallet, getBalance } from './helpers';
import { MIN_FEE, FEE_ADDRESS } from './constants';

export type Funds = {
  ERG: number;
  tokens: { tokenId: string; amount: number }[];
};

export async function sendFunds(args: { funds: Funds; toAddress: string; additionalRegisters: dataInputsType }) {
  const { funds, toAddress, additionalRegisters = {} } = args;

  funds.ERG = funds.ERG ? funds.ERG : funds.tokens.length ? MIN_FEE : 0;
  // funds.ERG = funds.ERG || MIN_FEE;
  const optimalTxFee = MIN_FEE;
  const need = {
    ERG: funds.ERG + optimalTxFee,
    ...funds.tokens.reduce<Record<string, number>>((map, token) => {
      map[token.tokenId] = map[token.tokenId] || 0;
      map[token.tokenId] += token.amount;
      return map;
    }, {}),
  };
  const creationHeight = await currentHeight();
  const have = JSON.parse(JSON.stringify(need));

  let boxes: UtxoBox[] = [];

  const keys = Object.keys(have);
  const totalBalance = await loadTokensFromWallet();

  if (
    // todo: check that there is enough ergo
    keys
      .filter((key) => key !== 'ERG')
      .filter((key) => !Object.keys(totalBalance).includes(key) || totalBalance[key].amount < have[key]).length > 0
  ) {
    throw Error('Not enough balance in the wallet!');
  }

  for (let i = 0; i < keys.length; i++) {
    if (have[keys[i]] <= 0) continue;
    const currentBoxes = await ergo.get_utxos(have[keys[i]].toString(), keys[i]);

    if (currentBoxes !== undefined) {
      currentBoxes.forEach((bx) => {
        have['ERG'] -= parseInt(bx.value);
        bx.assets.forEach((asset) => {
          if (!Object.keys(have).includes(asset.tokenId)) have[asset.tokenId] = 0;
          have[asset.tokenId] -= parseInt(asset.amount);
        });
      });
      boxes = boxes.concat(currentBoxes);
    }
  }

  if (keys.filter((key) => have[key] > 0).length > 0) {
    throw Error('Not enough balance in the wallet!');
  }

  const fundBox = {
    value: funds.ERG.toString(),
    ergoTree: Address.from_mainnet_str(toAddress).to_ergo_tree().to_base16_bytes(),
    assets: funds.tokens.map((t) => ({ tokenId: t.tokenId, amount: t.amount.toString() })),
    additionalRegisters,
    creationHeight,
  };

  const feeBox = {
    value: optimalTxFee.toString(),
    creationHeight,
    ergoTree: FEE_ADDRESS,
    assets: [],
    additionalRegisters: {},
  };

  const changeBox = {
    value: (-have['ERG']).toString(),
    ergoTree: Address.from_mainnet_str(await ergo.get_change_address())
      .to_ergo_tree()
      .to_base16_bytes(),
    assets: Object.keys(have)
      .filter((key) => key !== 'ERG')
      .filter((key) => have[key] < 0)
      .map((key) => {
        return {
          tokenId: key,
          amount: (-have[key]).toString(),
        };
      }),
    additionalRegisters: {},
    creationHeight,
  };

  const unsigned = {
    inputs: boxes.map((box) => {
      return {
        ...box,
        extension: {},
      };
    }),
    outputs: [fundBox, changeBox, feeBox],
    dataInputs: [],
    fee: optimalTxFee,
  };

  return unsigned;
}
