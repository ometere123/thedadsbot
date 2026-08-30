import test from 'node:test';import assert from 'node:assert/strict';import {NonceManager} from '../packages/core/src/nonce-manager.js';
test('nonce manager prevents same-process collisions',()=>{const n=new NonceManager(),a='0xabc';n.seed(a,9);assert.equal(n.reserve(a),9);assert.equal(n.reserve(a),10);assert.equal(n.snapshot().reservations.length,2);});
test('nonce release can safely reuse only the tail',()=>{const n=new NonceManager(),a='0xabc';n.seed(a,3);const x=n.reserve(a);n.release(a,x,{reuse:true});assert.equal(n.reserve(a),3);});
