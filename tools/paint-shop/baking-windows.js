/* Manufacturer reference polygons. D is minutes at or above the threshold;
   T is the channel peak in Celsius. Boundary points are accepted. */
'use strict';
(function(){
  const inside=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
  const ed={
    name:'ED Baking Window',manufacturer:'Kansai Paint Iranian Co',shortManufacturer:'Kansai Paint',
    image:'assets/ed-baking-window-original.avif?v=20261021-5',
    threshold:165,minDuration:15,maxDuration:35.5,minTemp:165,maxTemp:200,
    vertices:[[15,165],[15,200],[22,200],[35.5,172],[35.5,165]],
    xRange:[9,43],yRange:[150,211],xTicks:[10,15,20,22,25,30,35.5,40],yTicks:[160,165,170,180,190,200,210],
    durationMin:()=>15,
    durationMax:T=>inside(T,165,200)?Math.min(35.5,22+13.5/28*(200-T)):null,
    temperatureMin:()=>165,
    temperatureMax:D=>inside(D,15,35.5)?Math.min(200,200-28/13.5*(D-22)):null,
    rules:[
      ['R01','Insufficient Duration','D < 15 min',(D,T)=>D<15-1e-9],
      ['R02','Excessive Duration','D > 35.5 min',(D,T)=>D>35.5+1e-9],
      ['R03','Insufficient Temperature','Peak < 165°C',(D,T)=>T<165-1e-9],
      ['R04','Excessive Absolute Temperature','Peak > 200°C',(D,T)=>T>200+1e-9],
      ['R05','Outside Sloped Boundary','28D + 13.5T > 3316',(D,T)=>28*D+13.5*T>3316+1e-8]
    ]
  };
  // Source: Gamma Thinner reference supplied by the user, dated 1405.05.03.
  // Shared by Primer and Base Coat as specified by the user.
  const gamma={
    name:'Gamma Thinner Baking Window',manufacturer:'Gamma Thinner',shortManufacturer:'Gamma Thinner',
    image:'assets/gamma-baking-window.png?v=20261021-4',
    threshold:140,minDuration:15,maxDuration:40,minTemp:140,maxTemp:155,
    vertices:[[15,155],[30,155],[40,140],[20,140]],
    xRange:[10,45],yRange:[135,160],xTicks:[10,15,20,25,30,35,40,45],yTicks:[135,140,145,150,155,160],
    durationMin:T=>inside(T,140,155)?(200-T)/3:null,
    durationMax:T=>inside(T,140,155)?(400-2*T)/3:null,
    temperatureMin:D=>inside(D,15,40)?Math.max(140,200-3*D):null,
    temperatureMax:D=>inside(D,15,40)?Math.min(155,200-1.5*D):null,
    rules:[
      ['R01','Insufficient Duration','D < 15 min',(D,T)=>D<15-1e-9],
      ['R02','Excessive Duration','D > 40 min',(D,T)=>D>40+1e-9],
      ['R03','Insufficient Temperature','Peak < 140°C',(D,T)=>T<140-1e-9],
      ['R04','Excessive Absolute Temperature','Peak > 155°C',(D,T)=>T>155+1e-9],
      ['R05','Outside Upper Sloped Boundary','3D + 2T > 400',(D,T)=>3*D+2*T>400+1e-8],
      ['R06','Outside Lower Sloped Boundary','3D + T < 200',(D,T)=>3*D+T<200-1e-8]
    ]
  };
  const windows={ed,primer:gamma,bc:gamma};
  window.BAMCOBakingWindows={get:stage=>windows[stage]||null,
    references:stage=>windows[stage]?[{id:stage,name:windows[stage].manufacturer}]:[]};
})();
