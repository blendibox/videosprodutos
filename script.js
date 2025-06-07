  const bubble = document.getElementById('videoBubble');
  const closeBtn = document.getElementById('closeBtn');
  const video = document.getElementById('produtoVideo');
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseIcon = document.getElementById('pauseIcon');
  const muteBtn = document.getElementById("muteBtn");
  const muteIcon = document.getElementById('muteIcon');
  const urlParams = new URLSearchParams(window.location.search);
  const v = ((urlParams.get('video'))?urlParams.get('video'):'3em1_puffer'); -> substitua [3em1_puffer] pelo nome do seu vídeo default
  const nomeVideo = './videos/' + v + '.mp4'; 

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
		pauseIcon.src = './images/videocommands/pause.png';
	  } else {
		video.pause();
		pauseIcon.src = './images/videocommands/play.png';
	  }
  });

muteBtn.addEventListener("click", (e) => {
   e.stopPropagation();
   video.muted = !video.muted;
   muteIcon.src = video.muted
    ? './images/videocommands/soundx.png'
    : './images/videocommands/sound.png';
});