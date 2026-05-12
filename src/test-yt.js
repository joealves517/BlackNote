const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
  },
};
fetch(INNERTUBE_API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId: "vvZEBGrUQUI" })
}).then(r => r.json()).then(d => console.log(!!d.captions)).catch(console.error);
