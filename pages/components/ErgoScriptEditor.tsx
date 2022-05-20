import { useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { scala } from '@codemirror/legacy-modes/mode/clike';
import { basicSetup } from '@codemirror/basic-setup';

export default function ErgoScriptEditor({ onChange, code, height = '500px' }) {
  const editor = useRef();
  const handleUpdate = (value) => {
    onChange(value);
  }

  return (
    <CodeMirror
      ref={editor}
      value={code}
      height={height}
      theme={'dark'}
      extensions={[basicSetup, StreamLanguage.define(scala)]}
      onChange={(value) => {
        handleUpdate(value);
      }}
    />
  );
}
