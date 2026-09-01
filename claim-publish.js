(function () {
  function shQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }
  var form = document.getElementById("claim-form");
  var fieldCli = document.getElementById("field-cli");
  var fieldDate = document.getElementById("field-date");
  if (!form || !fieldCli || !fieldDate) return;
  form.addEventListener("submit", function () {
    var name = (document.getElementById("parent-name") || {}).value || "";
    name = String(name).trim();
    var date = fieldDate.value || "";
    fieldCli.value = [
      "git pull",
      "python3 scripts/claim-snack.sh " + shQuote(date) + " " + shQuote(name),
      "git add index.html",
      "git commit -m " + shQuote("Claim " + date + " snacks: " + name),
      "git push"
    ].join(" && ");
  });
})();
