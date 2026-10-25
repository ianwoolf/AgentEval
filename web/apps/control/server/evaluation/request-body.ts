/** Bound the stream before buffering; never transcode uploaded XLSX bytes. */
export async function readBoundedBody(request: Request, limit: number): Promise<ArrayBuffer> {
  const reader=request.body?.getReader();
  if(!reader)return new ArrayBuffer(0);
  const parts:Uint8Array[]=[];
  let length=0;
  try {
    while(true){
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();throw new Error('Request too large');}
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes.buffer;
}
