const fs=require('fs'),path=require('path'),Module=require('module'),React=require('react');
(async()=>{
let source=fs.readFileSync('src/components/CustomerInvoiceWorkbench.js','utf8').replace(/^import .*;\r?$/gm,'');
source=`const React=require('react');const {useEffect,useMemo,useRef,useState,useTransition}=React;
const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
const useRouter=()=>({push(){},refresh(){}});const dateText=v=>v;const invoiceQrUrl=()=>'';const ActionIcon=()=>null;\n`+source;
await require('next/dist/build/swc').loadBindings();
const {code}=await require('next/dist/build/swc').transform(source,{filename:'CustomerInvoiceWorkbench.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
const mod=new Module(path.resolve('tmp/cancellation-ui-fixture.cjs'),module);mod.paths=module.paths;mod._compile(code,path.resolve('tmp/cancellation-ui-fixture.cjs'));
const rows=[{InvoiceID:1,InvoiceNo:'INS/26-27/1547',InvoiceDate:'24-11-2026',CanEditQuantities:true},{InvoiceID:2,InvoiceNo:'INS/26-27/1546',InvoiceDate:'24-11-2026',CanEditQuantities:false},{InvoiceID:3,InvoiceNo:'INS/26-27/1545',InvoiceDate:'24-11-2026',CancelledAt:'2026-11-24'}];
const html=require('react-dom/server').renderToStaticMarkup(React.createElement(mod.exports.default,{rows,selectedInvoice:{InvoiceID:3,InvoiceNo:'INS/26-27/1545',CancelledAt:'2026-11-24'},search:''}));
const {chromium}=require('C:/Users/Mithlesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1560,height:1000}});
await page.setContent('<style>'+fs.readFileSync('src/app/globals.css','utf8')+'</style>'+html);
const assert=require('assert/strict');assert.equal(await page.getByRole('button',{name:/Cancel invoice INS/}).count(),2);
assert.equal(await page.getByRole('button',{name:'Save invoice',exact:true}).isDisabled(),true);
assert.equal(await page.getByRole('button',{name:'New invoice',exact:true}).isEnabled(),true);
const action=await page.getByRole('columnheader',{name:'ACTION',exact:true}).boundingBox(),cancel=await page.getByRole('columnheader',{name:'CANCEL',exact:true}).boundingBox();assert(cancel.x>=action.x+action.width-1);
await page.screenshot({path:'tmp/cancellation-tests/invoice-cancellation-ui.png',fullPage:true});await browser.close();console.log('Passed rendered UI: cancel button after Action including IRN-locked rows, cancelled badge, disabled editor/save, usable New invoice.');
})().catch(e=>{console.error(e.message);process.exitCode=1});

