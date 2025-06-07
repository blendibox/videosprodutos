  const bubble = document.getElementById('videoBubble');
  const closeBtn = document.getElementById('closeBtn');
  const video = document.getElementById('produtoVideo');
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseIcon = document.getElementById('pauseIcon');
  const muteBtn = document.getElementById("muteBtn");
  const muteIcon = document.getElementById('muteIcon');
  const urlWidgetBubble = 'https://video.blendibox.com.br';// altere aqui
  const h1VideoB =  document.getElementsByClassName('main-product-name')[0].textContent;

  const  nVideo =  h1VideoB.split("|");
 
  //const divBubble = document.getElementById('divBubble').getAttribute("data-nome");   
  const nomeVideo = urlWidgetBubble + '/videos/' + nVideo[1].trim()+ '.mp4'; 

  video.src = nomeVideo;

  bubble.addEventListener('click', () => {
    if (!bubble.classList.contains('expanded')) {
      bubble.classList.add('expanded');
	  video.muted=false;
    }
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Impede reabrir ao clicar no "X"
    bubble.classList.remove('expanded');
  });
  
  pauseBtn.addEventListener("click", (e) => {
	  e.stopPropagation();
	   if (video.paused) {
		video.play();
		pauseIcon.src = urlWidgetBubble + '/images/videocommands/pause.png';
	  } else {
		video.pause();
		pauseIcon.src = urlWidgetBubble + '/images/videocommands/play.png';
	  }
  });

muteBtn.addEventListener("click", (e) => {
   e.stopPropagation();
   video.muted = !video.muted;
   muteIcon.src = video.muted
    ? urlWidgetBubble + '/images/videocommands/soundx.png'
    : urlWidgetBubble + '/images/videocommands/sound.png';
});