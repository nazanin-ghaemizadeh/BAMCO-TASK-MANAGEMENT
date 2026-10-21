const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('sticker reads bypass cached authorization failures and retry after access recovers',async()=>{
 let allowed=false;const calls=[];
 const context={state:{user:{id:'member'},token:'token'},SB_URL:'https://example.supabase.co',SB_KEY:'public-key',document:{addEventListener(){}},location:{href:'https://example.org/app/'},URL,AbortController,Response,setTimeout,clearTimeout};
 context.window=context;
 context.fetch=async(url,options)=>{
  calls.push({url,options});
  // A browser still holds the old denied response for force-cache requests.
  if(!allowed||options.cache==='force-cache')return new Response('',{status:400});
  return new Response(new Blob(['image'],{type:'image/png'}));
 };
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/media-cache.js'),'utf8'),context);
 await assert.rejects(context.bamcoMedia.get('stickers','sets/3/state1_female.png'));
 allowed=true;
 const url=await context.bamcoMedia.get('stickers','sets/3/state1_female.png');
 assert.match(url,/^blob:/);
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.cache,'no-store');
 assert.ok(new URL(calls[1].url).searchParams.has('cacheNonce'));
 assert.equal(await context.bamcoMedia.get('stickers','sets/3/state1_female.png'),url);
 assert.equal(calls.length,2,'successful images reuse the application cache');
 context.bamcoMedia.clear();
});
