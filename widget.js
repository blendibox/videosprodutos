
var parser = new DOMParser();
var divMainHead = getElementsByTagName('script')[0];

// append js 
// append  css
// append widget


var divMainBublle =  document.getElementsByClassName("header-content-right ")[0];
var divBubble = '<div class="video-bubble" id="videoBubble">  <video id="produtoVideo" src="" autoplay muted loop playsinline ></video>  <dd id="blendidrop_video" value="" style="display:none"></dd>  <div class="video-controls" id="videoControls">   <button id="muteBtn">    <img id="muteIcon" src="./images/videocommands/sound.png" alt="Mute" />   </button>   <button id="pauseBtn">    <img id="pauseIcon" src="./images/videocommands/pause.png" alt="Pause" />   </button>   <button id="closeBtn">    <img src="./images/videocommands/close.png" alt="Fechar" />   </button>  </div> </div>';


var newNode = parser.parseFromString(divtroca, "text/html");
divMainBublle.prepend(newNode.documentElement);
console.log(newNode.documentElement);