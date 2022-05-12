import { OptionalBlock, AddressItem, Balance, Asset, UtxoBox } from './types';
import { Address } from 'ergo-lib-wasm-browser';

// declare global {
//   const ergo: {
//     get_utxos: (a: string, b: string) => Promise<UtxoBox[]>;
//     get_change_address: () => Promise<string>;
//     get_used_addresses: () => Promise<string[]>;
//     get_unused_addresses: () => Promise<string[]>;
//     sign_tx: (tx) => Promise<string>;
//     submit_tx: (tx) => Promise<string>;
//   };

//   const ergo_request_read_access: () => Promise<null>;
//   const ergo_check_read_access: () => Promise<null>;
// }

const MIN_FEE = 1000000;

export function isDappConnectorInstalled() {
  return typeof ergo_request_read_access === 'function';
}

export async function isWalletAccessibleForRead() {
  return await ergo_check_read_access();
}

export async function requestWalletReadAcess() {
  return await ergo_request_read_access();
}

// export async function sendTokenTx({
//   erg = 0,
//   addressList,
//   tokenId,
// }: {
//   tokenId?: string;
//   erg: number;
//   addressList: AddressItem[];
// }) {
//   const height = await currentHeight();
//   return await sendFunds({
//     erg,
//     addressList,
//     tokenId,
//     block: { height },
//   });
// }

export async function currentHeight() {
  return fetch('https://api.ergoplatform.com/api/v0/blocks?limit=1')
    .then((res: Response) => res.json())
    .then((res) => res.items[0].height);
}

export type dataInputsType = {
  R4?: string;
  R5?: string;
  R6?: string;
  R7?: string;
  R8?: string;
  R9?: string;
};

export async function generateRentStartTx({}) {}

interface Need {
  ERG: number;
  [key: string]: number;
}

export async function sendToken({
  tokenId,
  addressList,
  additionalRegisters = {},
}: {
  tokenId: string;
  addressList: AddressItem[];
  additionalRegisters: dataInputsType;
}) {
  const optimalTxFee = calculateOptimalFee(addressList);
  const need: Need = {
    ERG: MIN_FEE * addressList.length + optimalTxFee,
    [tokenId]: addressList.reduce(function (a, b) {
      return a + parseInt(b.amount);
    }, 0),
  };

  const block = { height: await currentHeight() };
  const have = JSON.parse(JSON.stringify(need));

  let boxes: UtxoBox[] = [];

  const keys = Object.keys(have);

  const totalBalance = await loadTokensFromWallet();

  if (
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

  const fundBoxes = addressList.map((item) => {
    return {
      value: MIN_FEE.toString(),
      ergoTree: Address.from_mainnet_str(item.address).to_ergo_tree().to_base16_bytes(),
      assets: [
        {
          tokenId,
          amount: item.amount.toString(),
        },
      ],
      additionalRegisters,
      creationHeight: block.height,
    };
  });

  const feeBox = {
    value: optimalTxFee.toString(),
    creationHeight: block.height,
    ergoTree:
      '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304',
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
    creationHeight: block.height,
  };

  const unsigned = {
    inputs: boxes.map((box) => {
      return {
        ...box,
        extension: {},
      };
    }),
    outputs: [changeBox, ...fundBoxes, feeBox],
    dataInputs: [],
    fee: optimalTxFee,
  };

  return unsigned;
}

interface Dic {
  [key: string]: Asset;
}

export async function loadTokensFromWallet() {
  const addresses: string[] = (await ergo.get_used_addresses()).concat(await ergo.get_unused_addresses());
  const tokens: Dic = {};

  for (let i = 0; i < addresses.length; i++) {
    const balance: Balance = await getBalance(addresses[i]);
    balance.tokens.forEach((asset: Asset) => {
      if (!Object.keys(tokens).includes(asset.tokenId))
        tokens[asset.tokenId] = {
          amount: 0,
          name: asset.name,
          tokenId: asset.tokenId,
        };
      tokens[asset.tokenId].amount += asset.amount;
    });
  }

  return tokens;
}

export async function getBalance(addr: string): Promise<Balance> {
  return await fetch(`https://api.ergoplatform.com/api/v1/addresses/${addr}/balance/confirmed`).then((res) =>
    res.json(),
  );
}

export function calculateOptimalFee(addressList: AddressItem[]) {
  return Math.round(MIN_FEE + (addressList.length * MIN_FEE) / 5);
}
