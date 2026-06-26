// 区域の貸し出し状況（全体図の一覧に表示）
// ▼自動連携：GoogleスプレッドシートのS-13（公開ステータスタブ）をCSVで読み込み、
//   区域番号→状態（空き／使用中）を自動反映します。
//   管理者はS-13（Googleスプレッドシート）を更新するだけでOK。このファイルは触らなくて構いません。
//
// 下の TERR_STATUS は、CSVが読み込めなかったときのフォールバック（初期値）です。
window.TERR_STATUS = {
  "1": "空き",
  "2": "空き",
  "3": "空き"
};

// S-13「公開ステータス」タブの公開CSV（区域番号・状態のみ。氏名は含まれません）
window.TERR_STATUS_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSMy3oCdp3soYGtLFCECaGpJ4Q8ODCMOD6qL5x1FYzWxUFjqc_jhYahmkjEIkPdklF9yjMby8QCzBqi/pub?gid=852025746&single=true&output=csv";

(function () {
  if (!window.TERR_STATUS_CSV) return;
  var url = window.TERR_STATUS_CSV + "&_=" + Date.now(); // キャッシュ回避
  fetch(url)
    .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
    .then(function (text) {
      var lines = text.split(/\r?\n/);
      var map = {};
      for (var i = 1; i < lines.length; i++) { // 1行目はヘッダー
        var cols = lines[i].split(",");
        var num = (cols[0] || "").trim();
        var st = (cols[1] || "").trim();
        if (!/^\d+$/.test(num)) continue;
        if (st === "使用中") st = "貸出中"; // 地図の表記に合わせる
        if (st) map[num] = st;
      }
      if (Object.keys(map).length) {
        window.TERR_STATUS = map;
        // 全体図の一覧が既に開いていれば再描画（フックがあれば呼ぶ）
        if (typeof window.refreshOverviewStatus === "function") {
          try { window.refreshOverviewStatus(); } catch (e) {}
        }
      }
    })
    .catch(function () { /* 取得失敗時はフォールバックの初期値を使用 */ });
})();
