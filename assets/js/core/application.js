/* BAMCO application kernel: one namespace, one fetch pipeline, one navigation contract. */
(()=>{
  'use strict';
  const root=globalThis;
  const Bamco=root.Bamco||(root.Bamco={});
  const state=Bamco.state||(Bamco.state={
    token:'',user:null,profile:null,profiles:[],tasks:[],requests:[],requestHistory:[],
    definitionRequests:[],requestRoutes:[],view:'dashboard'
  });
  const lifecycle=new Map(),events=new Map();let titles={},currentView=state.view||null;
  function emit(type,detail={}){
    for(const listener of events.get(type)||[])listener(detail);
    if(typeof root.CustomEvent==='function')root.document?.dispatchEvent(new root.CustomEvent(`bamco:${type}`,{detail}));
  }
  function on(type,listener){const listeners=events.get(type)||new Set();listeners.add(listener);events.set(type,listeners);return()=>listeners.delete(listener)}
  function registerView(id,{activate,dispose}={}){if(!id||lifecycle.has(id))throw new Error(`View already registered: ${id}`);lifecycle.set(id,{activate,dispose});return()=>lifecycle.delete(id)}
  function disposeView(id){try{lifecycle.get(id)?.dispose?.()}catch(error){console.warn('BAMCO view dispose',id,error)}}

  const nativeFetch=typeof root.fetch==='function'?root.fetch.bind(root):null;
  const middleware=[];
  function use(name,handler){
    if(!name||typeof handler!=='function')throw new TypeError('A named network middleware is required.');
    if(middleware.some(entry=>entry.name===name))return()=>{};
    const entry={name,handler};middleware.push(entry);return()=>{const index=middleware.indexOf(entry);if(index>=0)middleware.splice(index,1)};
  }
  function run(input,init={},index=0){
    const next=(nextInput=input,nextInit=init)=>run(nextInput,nextInit,index+1),entry=middleware[index];
    return entry?entry.handler(input,init,next):nativeFetch?nativeFetch(input,init):Promise.reject(new Error('Network transport is unavailable.'));
  }
  const network={raw:(input,init={})=>nativeFetch?nativeFetch(input,init):Promise.reject(new Error('Network transport is unavailable.')),use,request:(input,init={})=>run(input,init),middlewares:()=>middleware.map(entry=>entry.name)};
  if(nativeFetch&&!root.fetch.__bamcoNetworkPipeline){const wrapped=(input,init={})=>run(input,init);wrapped.__bamcoNetworkPipeline=true;root.fetch=wrapped}

  const navigation={
    configure(options={}){if(options.state&&options.state!==state)throw new Error('Navigation must use the shared application state.');titles={...titles,...(options.titles||{})};return this},
    registerView,on,current:()=>currentView,
    navigate(view){
      if(typeof view!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(view))return false;
      const target=root.document?.getElementById(`${view}View`);if(!target)return false;
      const previous=currentView;if(previous&&previous!==view)disposeView(previous);emit('navigation-before',{from:previous,to:view});
      root.bamcoLeaveHome?.();state.view=view;currentView=view;
      root.document?.querySelectorAll('.view').forEach(node=>node.classList.add('hidden'));target.classList.remove('hidden');
      root.document?.querySelectorAll('#nav button').forEach(node=>node.classList.toggle('active',node.dataset.view===view));
      const title=root.document?.querySelector('#viewTitle');if(title&&titles[view])title.textContent=titles[view];
      const add=root.document?.querySelector('#addTaskBtn');if(add)add.classList.toggle('hidden',view!=='kanban');
      lifecycle.get(view)?.activate?.();emit('navigation-after',{from:previous,to:view});return true;
    }
  };
  Bamco.state=state;Bamco.lifecycle={registerView,disposeView,on};Bamco.network=network;Bamco.navigation=navigation;
  root.BamcoNetwork=network;root.BamcoNavigation=navigation;
})();
