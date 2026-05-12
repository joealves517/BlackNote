fetch("https://blacknote-api-676582412453.us-central1.run.app/api/media/youtube-proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    payload: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId: "vvZEBGrUQUI"
      })
    }
  })
}).then(r => r.text()).then(text => console.log(text.substring(0, 500))).catch(console.error);
