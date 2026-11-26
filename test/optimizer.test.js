const O = require('../public/optimizer.js');
function gen(n, seed){
  let a=seed; const r=()=>{a=(a*1103515245+12345)%2147483648; return a/2147483648;};
  const depot={lat:35.8070,lng:139.7240};
  const users=[], coords=[depot];
  for(let i=0;i<n;i++){
    const p={lat:depot.lat+(r()-0.5)*0.09,lng:depot.lng+(r()-0.5)*0.11}; coords.push(p);
    users.push({id:'u'+i,name:'利用者'+i,wheelchair:r()<0.2,ready:r()<0.3?'08:40':null,maxRideMin:60,group:null});
    if(users[i].group){} 
  }
  // make pairs of groups
  for(let i=0;i<n;i+=13){ if(i+1<n){users[i].group='g'+i; users[i+1].group='g'+i;} }
  const vehicles=[
    {id:'v1',name:'1号車',seats:7,wheelchairSlots:1,maxTrips:2,availableFrom:'08:00',availableUntil:'18:00'},
    {id:'v2',name:'2号車',seats:7,wheelchairSlots:1,maxTrips:2,availableFrom:'08:00',availableUntil:'18:00'},
    {id:'v3',name:'3号車 (リフト)',seats:3,wheelchairSlots:3,maxTrips:2,availableFrom:'08:00',availableUntil:'18:00'},
    {id:'v4',name:'4号車',seats:4,wheelchairSlots:0,maxTrips:2,availableFrom:'08:15',availableUntil:'18:00'}];
  users[3].fixedVehicle='v2'; users[5].avoidVehicles=['v1'];
  return {users,vehicles,coords};
}
for (const dir of ['pickup','dropoff']) for (const n of [12, 30]) {
  const {users,vehicles,coords}=gen(n,7);
  const matrix=O.estimateMatrix(coords);
  const res=O.optimize({direction:dir,facilityTime:dir==='pickup'?'09:30':'16:00',matrix,users,vehicles},{timeMs:1500,coords});
  console.log(`\n== ${dir} n=${n} 車両${res.summary.usedVehicles} 走行${res.summary.totalTravelMin}分 ${res.summary.totalDistKm}km 最大乗車${res.summary.maxRideMin}分 iter=${res.iterations} ${res.elapsedMs}ms`);
  for (const v of res.vehicles) for (const t of v.trips) console.log(` ${v.vehicleName} ${t.trip}便 ${t.depart}→${t.arrive} 席${t.seatsUsed} 車椅子${t.wheelchairsUsed}: `+t.stops.map(s=>`${s.name}${s.wheelchair?'♿':''}@${s.time}(${s.rideMin})`).join(' '));
  console.log(' 違反:',res.violations, '警告:',res.warnings);
  // check all users assigned once
  const ids=res.vehicles.flatMap(v=>v.trips.flatMap(t=>t.stops.map(s=>s.userId)));
  console.assert(ids.length===n && new Set(ids).size===n, 'assignment mismatch');
  const ev=O.evaluate({direction:dir,facilityTime:dir==='pickup'?'09:30':'16:00',matrix,users,vehicles},res.assignment);
  console.assert(Math.abs(ev.cost-res.cost)<1e-6,'evaluate mismatch');
  const mv=O.moveUser({direction:dir,facilityTime:'09:30',matrix,users,vehicles},res.assignment,'u0','v4',1);
  console.assert(mv.assignment.v4[0].includes('u0'),'move failed');
}
