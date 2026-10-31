const form=document.getElementById('delivery-plan-form');
if(form){
 const result=document.getElementById('delivery-plan-result'),download=document.getElementById('delivery-plan-download');
 let brief='';
 form.addEventListener('input',()=>{brief='';result.hidden=true;download.hidden=true;});
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(form),from=String(data.get('from')).trim(),to=String(data.get('to')).trim();
  for(const [name,value]of [['from',from],['to',to]]){
   const input=form.elements.namedItem(name);input.setCustomValidity(value.length<2?'Enter a suburb or city.':'');
   if(!input.reportValidity())return;
  }
  brief=['FRANKS24 / DISPATCH','DELIVERY BRIEF — SERVICE PREVIEW','',`Collect from: ${from}`,`Deliver to: ${to}`,`Parcel: ${data.get('parcel')}`,'','Have your parcel weight, dimensions and preferred collection time ready.','This is not a quote, booking or service-coverage confirmation.','This plan has not been submitted to an operator.','Customer desk: https://dispatch.franks24.com/deliveries/'].join('\n');
  result.textContent=brief;result.hidden=false;download.hidden=false;
 });
 for(const input of form.querySelectorAll('input'))input.addEventListener('input',()=>input.setCustomValidity(''));
 download.addEventListener('click',()=>{
  if(!brief)return;
  const url=URL.createObjectURL(new Blob([brief],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download='Franks24-delivery-plan.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 });
}
