import { createRequire } from 'node:module';
import vm from 'node:vm';
import type { KeyboardAvoidingViewProps } from 'react-native';
import type { ComponentClass } from 'react';

function realKeyboardSource() {
  const local=createRequire(import.meta.url);
  const rn=createRequire(local.resolve('react-native/package.json'));
  const babel: unknown=rn('@babel/core');
  if (!babel || typeof babel !== 'object' || !('transformFileSync' in babel) || typeof babel.transformFileSync !== 'function')
    throw new Error('Expected the installed Babel transformer');
  const file=rn.resolve('./Libraries/Components/Keyboard/KeyboardAvoidingView.js');
  const result: unknown=babel.transformFileSync(file,{presets:[rn.resolve('@react-native/babel-preset')],babelrc:false,configFile:false});
  if (!result || typeof result !== 'object' || !('code' in result) || typeof result.code !== 'string') throw new Error('Could not compile installed RN keyboard component');
  return result.code;
}

import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

const native = vi.hoisted(() => {
  const state: { os: string; listeners: Map<string, (event: unknown) => void>; component: unknown } = {
    os: 'android', listeners: new Map(), component: undefined,
  };
  return state;
});
vi.mock('@expo/vector-icons/Ionicons',()=>({default:'icon'}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'safe-area'}));
vi.mock('react-native',()=>({
  Platform:{get OS(){return native.os;}},
  get KeyboardAvoidingView(){return native.component;},
  View:'native-view',ScrollView:'scroll',Text:'text',TextInput:'input',Pressable:'button',ActivityIndicator:'spinner',
  StyleSheet:{create:(x:unknown)=>x,hairlineWidth:1},
}));

function realKeyboardComponent(){
  const local=createRequire(import.meta.url);
  const compiled=realKeyboardSource();
  const mod={exports:{}};
  const mockRequire=(id:string)=>{
    if(id.endsWith('/LayoutAnimation'))return {configureNext:()=>{},Types:{keyboard:'keyboard'}};
    if(id.endsWith('/StyleSheet'))return {compose:(a:unknown,b:unknown)=>[a,b]};
    if(id.endsWith('/Platform'))return {get OS(){return native.os;}};
    if(id.endsWith('/AccessibilityInfo'))return {prefersCrossFadeTransitions:async()=>false};
    if(id.endsWith('/View'))return 'native-view';
    if(id==='./Keyboard')return {isVisible:()=>false,addListener:(name:string,fn:(event:unknown)=>void)=>{native.listeners.set(name,fn);return {remove:()=>native.listeners.delete(name)};}};
    return local(id);
  };
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})')(mockRequire,mod,mod.exports);
  const loaded: unknown=mod.exports;
  if (!loaded || typeof loaded !== 'object' || !('default' in loaded) ||
      typeof loaded.default !== 'function' || !(loaded.default.prototype instanceof React.Component))
    throw new Error('Expected the installed React keyboard component class');
  return loaded.default as ComponentClass<KeyboardAvoidingViewProps>;
}

test.each(['android','ios'])('%s hidden keyboard leaves the real Screen at native window height',async(platform)=>{
  native.os=platform;
  native.listeners.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('React',React);
  native.component=realKeyboardComponent();
  const {Screen}=await import('./core');
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(Screen,null,React.createElement('text',null,'Body')));});
  const layout=async(height:number)=>{await act(async()=>{root!.root.find((node)=>String(node.type)==='native-view').props.onLayout({persist:()=>{},nativeEvent:{layout:{x:0,y:0,width:1080,height}}});});};
  const emit=async(name:string,y:number,height:number)=>{await act(async()=>{native.listeners.get(name)?.({duration:0,easing:'keyboard',endCoordinates:{screenX:0,screenY:y,width:1080,height}});});};
  await layout(2178);
  await emit(platform==='ios'?'keyboardWillShow':'keyboardDidShow',1200,978);
  await layout(1200);
  // RN Android emits visible-window HEIGHT, rather than bottom, when the keyboard hides.
  // Physical status inset99 makes that2079 although the native window grows to2178.
  await emit(platform==='ios'?'keyboardWillHide':'keyboardDidHide',2079,0);
  const style=Object.assign({},...root!.root.find((node)=>String(node.type)==='native-view').props.style.filter(Boolean));
  await act(async()=>root!.unmount());
  expect(style.height,'A hidden keyboard must not reserve the status-bar height below the screen').toBeUndefined();
  expect(style.flex).toBe(1);
  vi.unstubAllGlobals();
});
