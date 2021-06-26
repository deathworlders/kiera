
// Controls the invert button
(function() {
	var btn = document.getElementById("invert-btn");

	if (typeof localStorage.inverted == "undefined") {
		localStorage.inverted = "0";
	}

	function apply() {
		if (localStorage.inverted == "1") {
			document.body.classList.add( "inverted" );
		} else {
			document.body.classList.remove( "inverted" );
		}
	}
	apply();

	btn.onclick = function() {
		localStorage.inverted = (localStorage.inverted == "0" ? "1" : "0");
		apply();
	}
})();

// httpGet - Helper function to get a file from the server
// Basically used only to get the CSS file to style the epub contents properly
// and to get other html files if the user wants to download multiple at once
async function httpGet(url, is_binary) {
	return new Promise((s,e)=>{
		var xmlhttp = new XMLHttpRequest();

		if (typeof is_binary == "undefined") {is_binary = false;}

		if (is_binary == true) {
			xmlhttp.responseType = "blob";
		}

		xmlhttp.onreadystatechange = function() {
			if (xmlhttp.readyState == XMLHttpRequest.DONE) {
				if (xmlhttp.status == 200) {
					var response = (is_binary ? xmlhttp.response : xmlhttp.responseText);
					s(response);
				} else {
					e("Unable to get file: '"+url+"'");
				}
			}
		};

		xmlhttp.open("GET", url, true);
		xmlhttp.send();
	});
}

// openFile - Helper function mainly used to get the contents
// of a file that was selected using an <input type='file'>
function openFile( file, callback, callback_fail ) {
	var name = file.name;
	var type = file.type;

	var reader = new FileReader();

	if (reader.readAsBinaryString) {
		reader.onloadend = callback;
		reader.readAsBinaryString( file );
	} else {
		reader.onloadend = function(e) {
			var bytes = new Uint8Array(e.target.result);
			var binary = "";
			for (var i = 0; i < bytes.byteLength; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			callback({target:{result:binary}});
		}
		reader.readAsArrayBuffer( file );
	}

	if (callback_fail) {reader.addEventListener("error", callback_fail );}
}

// openImage - Helper function used to open images
// that was selected using an <input type='file'>
function openImage( file, callback, callback_fail ) {
	var name = file.name;
	var type = file.type;

	var reader = new FileReader();

	if (reader.readAsDataURL) {
		reader.onloadend = callback;
		reader.readAsDataURL( file );
	} else {
		alert("Your browser doesn't support 'readAsDataURL'!");
		if (callback_fail) {callback_fail();}
		reader = null;
		return;
	}

	if (callback_fail) {reader.addEventListener("error", callback_fail);}
}