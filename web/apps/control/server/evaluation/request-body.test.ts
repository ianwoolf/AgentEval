import { it,expect } from 'vitest';
import { readBoundedBody } from './request-body';
it('preserves binary XLSX bytes rather than decoding them as text',async()=>{
 const bytes=new Uint8Array([0x50,0x4b,0,255,128]);
 const value=await readBoundedBody(new Request('http://local',{method:'POST',body:bytes}),8);
 expect([...new Uint8Array(value)]).toEqual([80,75,0,255,128]);
});
it('rejects streamed bodies over the limit even without content length',async()=>{
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));c.close();}});
 const request=new Request('http://local',{method:'POST',body,duplex:'half'} as RequestInit);
 await expect(readBoundedBody(request,5)).rejects.toThrow('Request too large');
});
