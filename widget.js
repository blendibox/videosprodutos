document.addEventListener('readystatechange', event => {
  if (event.target.readyState === 'complete') {
    getWidgetBubble();
  }
});

function getWidgetBubble(){
	
	var videoBubbleName = document.getElementById('divBubble').getAttribute("data-nome");
	console.log(videoBubbleName);
	var parser = new DOMParser();
	var divMainHead = document.getElementsByTagName('head')[0];
	var divMainBublle =  document.getElementsByTagName('body')[0];
	var urlWidgetBubble = 'https://video.blendibox.com.br';// altere aqui
	var scriptBubble = urlWidgetBubble + '/script.js';
	var cssBubble = urlWidgetBubble +'/style.css';
	var divBubble = '<div class="video-bubble" id="videoBubble">  <video id="produtoVideo" src="" autoplay muted loop playsinline ></video>  <dd id="blendidrop_video" value="" style="display:none"></dd>  <div class="video-controls" id="videoControls">   <button id="muteBtn">    <img id="muteIcon" src="./images/videocommands/sound.png" alt="Mute" />   </button>   <button id="pauseBtn">    <img id="pauseIcon" src="./images/videocommands/pause.png" alt="Pause" />   </button>   <button id="closeBtn">    <img src="./images/videocommands/close.png" alt="Fechar" />   </button>  </div> </div>';

	// append js 
	const scriptB = document.createElement('script');
    scriptB.src = scriptBubble;
	scriptB.async = "";
    divMainHead.appendChild(scriptB);
	
	const cssB = document.createElement('link');
    cssB.href = cssBubble;
	cssB.rel = "stylesheet";
	cssB.type = "text/css";
    divMainHead.appendChild(cssB);
	
	// append widget
	 newNode = parser.parseFromString(divBubble, "text/html");
	divMainBublle.prepend(newNode.documentElement);
	console.log(newNode.documentElement);
}




