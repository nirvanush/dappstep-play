import { wasmModule } from "./ergolib";
wasmModule.loadAsync();


export async function encodeLongTuple(a, b) {
  if (typeof a !== 'string') a = a.toString();
  if (typeof b !== 'string') b = b.toString();
  return wasmModule.SigmaRust.Constant.from_i64_str_array([a, b]).encode_to_base16();
}

export async function colTuple(a, b) {
  return wasmModule.SigmaRust.Constant.from_tuple_coll_bytes(
    Buffer.from(a, 'hex'),
    Buffer.from(b, 'hex'),
  ).encode_to_base16();
}

export async function encodeByteArray(reg) {
  return wasmModule.SigmaRust.Constant.from_byte_array(reg).encode_to_base16();
}

export async function decodeLongTuple(val) {
  return wasmModule.SigmaRust.Constant.decode_from_base16(val)
    .to_i64_str_array()
    .map((cur) => parseInt(cur));
}

export function encodeNum(n, isInt = false) {
  if (isInt) return wasmModule.SigmaRust.Constant.from_i32(n).encode_to_base16();
  else return wasmModule.SigmaRust.Constant.from_i64(wasmModule.SigmaRust.I64.from_str(n)).encode_to_base16();
}

export async function decodeNum(n, isInt = false) {
  if (isInt) return wasmModule.SigmaRust.Constant.decode_from_base16(n).to_i32();
  else return wasmModule.SigmaRust.Constant.decode_from_base16(n).to_i64().to_str();
}

export function encodeHex(reg) {
  return wasmModule.SigmaRust.Constant.from_byte_array(Buffer.from(reg, 'hex')).encode_to_base16();
}

function toHexString(byteArray) {
  return Array.from(byteArray, function (byte) {
    return ('0' + (byte & 0xff).toString(16)).slice(-2);
  }).join('');
}

export async function decodeString(encoded) {
  return toHexString(wasmModule.SigmaRust.Constant.decode_from_base16(encoded).to_byte_array());
}






