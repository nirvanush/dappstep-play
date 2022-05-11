import { useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {StreamLanguage} from "@codemirror/language"
import {scala} from "@codemirror/legacy-modes/mode/clike";
import {EditorView, EditorState, basicSetup} from "@codemirror/basic-setup"
import _ from 'lodash';

export default function ErgoScriptEditor({
  onChange,
  code,
  height = '500px',
}) {
  const editor = useRef();
  const handleUpdate = _.debounce((value) => {
    onChange(value)
  }, 1000)

  return (
    <CodeMirror
      ref={editor}
      value={code}
      height={height}
      theme={'dark'}
      extensions={[basicSetup, StreamLanguage.define(scala)]}
      onChange={(value, viewUpdate) => {
        handleUpdate(value);
      }}
    />
  )
}
