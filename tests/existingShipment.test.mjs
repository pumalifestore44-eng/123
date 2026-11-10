import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExistingShipment } from '../existing-shipment.mjs';
test('existing SPX input normalizes code and accepts zero COD and optional Order SN',()=>{
 assert.deepEqual(validateExistingShipment(' spxvn06556927884a ','','0'),{code:'SPXVN06556927884A',orderSn:'',cod:0});
 assert.equal(validateExistingShipment('SPXVN06556927884A','vn263129740655985e',180000).orderSn,'VN263129740655985E');
});
test('invalid code, Order SN and missing/negative/fractional COD cannot be saved',()=>{
 for(const value of ['','VN263129740655985E','https://spx.vn/test','SPXVN<script>'])assert.throws(()=>validateExistingShipment(value,'',0));
 assert.throws(()=>validateExistingShipment('SPXVN06556927884A','bad',0));
 for(const cod of ['','-1','1.5','NaN'])assert.throws(()=>validateExistingShipment('SPXVN06556927884A','',cod));
});
