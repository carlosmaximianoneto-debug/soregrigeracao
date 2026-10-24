(() => {
  'use strict';
  const carousel = document.querySelector('.pump-carousel');
  if (!carousel) return;
  const track = carousel.querySelector('.pump-track');
  const originalSlides = [...carousel.querySelectorAll('.pump-slide')];
  let slides = [...originalSlides];
  const pause = carousel.querySelector('.pump-pause');
  let dots = [...carousel.querySelectorAll('[data-slide]')];
  let catalogueReady = window.REFRI_CATALOGUE?.preview === true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, userPaused = reduced.matches, hovered = false, inView = true, timer = null, start = null, pausedOnPress = null;
  function render() {
    carousel.hidden = slides.length === 0 || !catalogueReady;
    if (!slides.length) return;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide,i) => { slide.setAttribute('aria-hidden', String(i !== index)); slide.inert = i !== index; });
    dots.forEach((dot,i) => dot.setAttribute('aria-current', String(i === index)));
    carousel.querySelector('.pump-position').textContent = `${index + 1} / ${slides.length}`;
  }
  function schedule() {
    clearInterval(timer);
    pause.setAttribute('aria-label',userPaused ? 'Reproduzir carrossel de bombas' : 'Pausar carrossel de bombas');
    pause.innerHTML = userPaused ? '<span aria-hidden="true">▶</span> Reproduzir' : '<span aria-hidden="true">Ⅱ</span> Pausar';
    if (!userPaused && !hovered && inView && !document.hidden && slides.length > 1) timer = setInterval(() => {index = (index + 1) % slides.length; render();}, 5000);
  }
  function go(next) {if(!slides.length)return;index = (next + slides.length) % slides.length; userPaused = true; render(); schedule();}
  carousel.querySelector('.pump-prev').addEventListener('click', () => go(index - 1));
  carousel.querySelector('.pump-next').addEventListener('click', () => go(index + 1));
  carousel.querySelector('.pump-dots').addEventListener('click',event=>{const dot=event.target.closest('[data-slide]');if(dot)go(Number(dot.dataset.slide));});
  pause.addEventListener('pointerdown', () => {pausedOnPress = userPaused;});
  pause.addEventListener('click', () => {userPaused = !(pausedOnPress ?? userPaused); pausedOnPress = null; schedule();});
  carousel.addEventListener('mouseenter', () => {hovered = true; schedule();});
  carousel.addEventListener('mouseleave', () => {hovered = false; schedule();});
  carousel.addEventListener('focusin', () => {userPaused = true; schedule();});
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault();go(index + (event.key === 'ArrowRight' ? 1 : -1));}
  });
  const viewport = carousel.querySelector('.pump-viewport');
  viewport.addEventListener('pointerdown', event => {start = {x:event.clientX,y:event.clientY};});
  viewport.addEventListener('pointerup', event => {
    if (!start) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    start = null;
    if (Math.abs(x) > 40 && Math.abs(x) > Math.abs(y)) go(index + (x < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => {start = null;});
  document.addEventListener('visibilitychange', schedule);
  function updateCatalogue(event){
    catalogueReady = true;
    const products=new Map(event.detail.products.map(p=>[String(p.id),p]));
    const next=originalSlides.filter(slide=>products.has(slide.dataset.productId));
    next.forEach(slide=>{const product=products.get(slide.dataset.productId);slide.querySelector('figcaption a').href=product.url;});
    if(next.length!==slides.length || next.some((slide,i)=>slide!==slides[i])){
      slides=next;index=0;track.replaceChildren(...slides);
      const container=carousel.querySelector('.pump-dots');container.replaceChildren();
      slides.forEach((slide,i)=>{slide.setAttribute('aria-label',`${i+1} de ${slides.length}`);const dot=document.createElement('button');dot.type='button';dot.dataset.slide=String(i);dot.setAttribute('aria-label',`Mostrar bomba ${i+1}`);container.append(dot);});
      dots=[...container.children];
    }
    render();schedule();
  }
  document.addEventListener('catalogue:updated',updateCatalogue);
  if(Array.isArray(window.REFRI_CURRENT_CATALOGUE)) updateCatalogue({detail:{products:window.REFRI_CURRENT_CATALOGUE}});
  reduced.addEventListener('change', () => {userPaused = reduced.matches; schedule();});
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {inView = entries[0].isIntersecting;schedule();}).observe(carousel);
  render();schedule();
})();
