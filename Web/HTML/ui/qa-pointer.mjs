// QA coordinates for full-page screenshots and viewport-based input drivers.
// The frame rectangle already includes scrolling inside the outer document.
export function pointerCoordinates({frame,canvas,offset,scroll={x:0,y:0},border={x:0,y:0}}){
  const viewport=[frame.left+border.x+canvas.left+offset.x,frame.top+border.y+canvas.top+offset.y];
  return{viewport,screen:[viewport[0]+scroll.x,viewport[1]+scroll.y]};
}

export function canvasPointerTarget(frame,canvas,offset){
  return pointerCoordinates({frame:frame.getBoundingClientRect(),canvas:canvas.getBoundingClientRect(),offset,scroll:{x:window.scrollX,y:window.scrollY},border:{x:frame.clientLeft,y:frame.clientTop}});
}
