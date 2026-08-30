import test from 'node:test';import assert from 'node:assert/strict';import {RunState,transition} from '../packages/core/src/state-machine.js';
test('full deterministic lifecycle is allowed',()=>{const r=new RunState();for(const s of ['PLANNED','VALIDATED','ARMED','TRIGGERED','SIMULATED','SIGNED','BROADCAST','PENDING','CONFIRMED'])r.move(s);assert.equal(r.state,'CONFIRMED');assert.equal(r.history.length,10);});
test('cannot jump from CREATED to SIGNED',()=>assert.throws(()=>transition('CREATED','SIGNED'),/invalid transition/));
test('can cancel before signing',()=>assert.equal(transition('PLANNED','CANCELLED'),'CANCELLED'));
