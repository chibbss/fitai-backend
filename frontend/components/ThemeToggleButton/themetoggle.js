function darkModeSwitch1(){
  var body = document.body;
  var check = document.getElementById("switch-image");
  if (check.classList.contains("darkActive")) {
    check.classList.remove("darkActive");
    body.classList.remove("body-dark");
  }
  else {
    check.classList.add("darkActive");
    body.classList.add("body-dark");
  }
}