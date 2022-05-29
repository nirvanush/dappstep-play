import { ExplorerBox } from '../ergoscript.js/Box';

declare global {
  interface Ergo {
    get_utxos: (a: string, b: string) => Promise<UtxoBox[]>;
    get_change_address: () => Promise<string>;
    get_used_addresses: () => Promise<string[]>;
    get_unused_addresses: () => Promise<string[]>;
    sign_tx: (tx: string) => Promise<string>;
    submit_tx: (tx: string) => Promise<string>;
  }

  interface ergoConnector {
    nautilus: {
      connect: () => Promise<null>;
    };
  }

  const ergo: Ergo;
  const ergoConnector: ergoConnector;

  const ergo_request_read_access: () => Promise<null>;
  const ergo_check_read_access: () => Promise<null>;

  interface Window {
    ergo: Ergo;
    ergo_request_read_access: () => Promise<null>;
    ergo_check_read_access: () => Promise<null>;
  }
}

export type OptionalBlock = {
  height: number;
};

export type AddressItem = {
  amount: string;
  address: string;
};

export type Asset = {
  tokenId: string;
  amount: number;
  decimals?: number;
  name?: string;
  tokenType?: string;
};

export type Balance = {
  nanoErgs: number;
  tokens: Asset[];
};

export type dataInputsType = {
  R4?: string | Uint8Array;
  R5?: string | Uint8Array;
  R6?: string | Uint8Array;
  R7?: string | Uint8Array;
  R8?: string | Uint8Array;
  R9?: string | Uint8Array;
};

export type UtxoBoxAsset = Omit<Asset, 'amount'> & { amount: string };

export type UtxoBox = {
  boxId: string;
  value: string;
  ergoTree: string;
  assets: UtxoBoxAsset[];
  creationHeight: number;
  transactionId: string;
  index: number;
};

/*
{
    "boxId": "ec3120cc3c978a03060b10bacf5c02a71614c0821b0055ce00a6150fbb277786",
    "value": "1102286",
    "ergoTree": "0008cd0377f1755ae02de3df15d0377f4fb625b9608e12efb8a78c37aefe0c02273a9a26",
    "assets": [
        {
            "amount": "2400",
            "tokenId": "e91cbc48016eb390f8f872aa2962772863e2e840708517d1ab85e57451f91bed"
        },
        {
            "amount": "2000",
            "tokenId": "fbbaac7337d051c10fc3da0ccb864f4d32d40027551e1c3ea3ce361f39b91e40"
        },
        {
            "amount": "250000000",
            "tokenId": "b5a117622d6008b5a971dcb442d275361f5d8dab1a2e29074c4af3b33de961c7"
        },
        {
            "amount": "650",
            "tokenId": "699a7fcc9978340acf5f8d4b7a43b1d21c0e82182792fe10ec43c032cfcd1d62"
        },
        {
            "amount": "100000",
            "tokenId": "a49d266ad4a412e6e6d51b19a3b9c2c2932a5bd66a57e04ae6ebb9702b81f851"
        },
        {
            "amount": "65000",
            "tokenId": "0cd8c9f416e5b1ca9f986a7f10a84191dfb85941619e49e53c0dc30ebf83324b"
        },
        {
            "amount": "3",
            "tokenId": "36aba4b4a97b65be491cf9f5ca57b5408b0da8d0194f30ec8330d1e8946161c1"
        },
        {
            "amount": "125000000000",
            "tokenId": "5a34d53ca483924b9a6aa0c771f11888881b516a8d1a9cdc535d063fe26d065e"
        }
    ],
    "creationHeight": 655182,
    "additionalRegisters": {},
    "transactionId": "ec43518f7c74dd0365c34f714cf5252cd33bc6e15d3da07bd187474d2e7c995b",
    "index": 1
}


*/
