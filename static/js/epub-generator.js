// Handle epub generation
(function() {
	// buildContainerXML - Helper function to create one of the required epub files
	function buildContainerXML() {
		return ([
			"<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
			"<container xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\" version=\"1.0\">",
				"<rootfiles>",
					"<rootfile full-path=\"content/info.opf\" media-type=\"application/oebps-package+xml\"/>",
				"</rootfiles>",
			"</container>"
		]).join("\n");
	}

	// buildOPF - Helper function to create one of the required epub files
	// Takes a list of file names to add to its manifest
	function buildOPF( title, author, date, files, separate_files, cover_filetype ) {
		// replace all non-alphanumeric characters with "-" to build a uid
		var title_uid = title.replace(/[^a-zA-Z0-9]/g, "-");

		var opf = [
			"<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
			"<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" xml:lang=\"en\" unique-identifier=\"uid\">",
				"<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">",
					"<dc:title>" + title + "</dc:title>",
					"<dc:creator>" + author + "</dc:creator>",
					"<dc:language>en-US</dc:language>",
					"<dc:identifier id=\"uid\">" + title_uid + "</dc:identifier>",
					"<meta property=\"dcterms:modified\">" + date + "</meta>",
				"</metadata>",
				"<manifest>"];

		// Add the files to the manifest
		for(var i=0;i<files.length;i++) {
			opf.push("<item id=\"part" + (i+1) + "\" href=\"" + files[i] + "\" media-type=\"application/xhtml+xml\" />");
		}
		// Add separate files to the manifest
		for(var i=0;i<separate_files.length;i++) {
			opf.push("<item id=\"part_extra" + (i+1) + "\" href=\"" + separate_files[i].filename + "\" media-type=\"" + separate_files[i].type + "\" />");
		}

		// Add the navigation file to the manifest
		opf.push( "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\" />" );

		// Add the css file to the manifest
		opf.push( "<item id=\"css\" href=\"css/css.css\" media-type=\"text/css\" />" );

		// Add the cover image to the manifest
		if (cover_filetype != "") {
			opf.push( "<item id=\"cover-image\" href=\"cover." + cover_filetype + "\" media-type=\"image/" + cover_filetype + "\" properties=\"cover-image\" />" );
			opf.push( "<item id=\"cover\" href=\"cover.xhtml\" media-type=\"application/xhtml+xml\" />" );
		}

		opf.push("</manifest>");
		opf.push("<spine>");
		if (cover_filetype != "") {
			opf.push( "<itemref idref=\"cover\" linear=\"no\" />" );
		}

		// Add the files to the spine
		for(var i=0;i<files.length;i++) {
			opf.push("<itemref idref=\"part" + (i+1) + "\" />");
		}

		// Add separate files to the spine
		for(var i=0;i<separate_files.length;i++) {
			if (separate_files[i].type != "application/xhtml+xml") {continue;}
			opf.push( "<itemref idref=\"part_extra" + (i+1) + "\" linear=\"no\" />" );
		}

		opf.push("</spine>");
		opf.push("</package>");

		return opf.join("\n");
	}

	// buildFile - Helper function to create the main content in the epub
	// Used to build each chapter of the book, and also the nav file.
	function buildFile(content, is_nav) {
		var nav = "";
		// if the file being created is the nav file, we need an extra option
		if (typeof is_nav != "undefined" && is_nav == true) {
			nav = " xmlns:epub=\"http://www.idpf.org/2007/ops\"";
		}

		return ([
			// set the header stuff
			"<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
			"<html xmlns=\"http://www.w3.org/1999/xhtml\"" + nav + ">",
			"<head><title>Deathworlders.com</title>",
			"<meta charset=\"utf-8\" />",
			"<link rel=\"stylesheet\" type=\"text/css\" href=\"css/css.css\" />",
			"</head>",

			// set the text
			"<body><article>",
			content,
			"</article></body>",
			"</html>"
		]).join("\n");
	}

	// prefixZeroes - Helper function that adds a bunch of zeroes in front of a number
	function prefixZeroes(num) {
		if (num < 10) {return "00" + num;}
		if (num < 100) {return "0" + num;}
		return num;
	}

	// downloadEPUB - Does all the work
	function downloadEPUB( epub_info, cover_image, onFinished ) {
		try {
			var baseUrl = epub_info.baseUrl;
			var book_title = epub_info.title;

			// get download progress elements
			var popup = document.getElementsByClassName( "download-epub-cover-selector-popup" )[0];
			var download_progress = popup.getElementsByClassName("download-progress")[0];
			var download_progress_label = download_progress.getElementsByClassName("download-progress-label")[0];
			var download_progress_other = popup.getElementsByClassName("download-other")[0];
			var add_titles_checkbox = document.getElementById("download-epub-add-label");

			// Step 1 - Download the css file
			httpGet( baseUrl + "css/styles.css", function( css_file ) {
				var requested = 0;
				var err = false;
				var downloads = {};
				var texts = [];
				var separate_files = [];
				var chapters = [];

				download_progress.classList.remove("hidden");
				download_progress_other.classList.add("blur");

				// Step 2 - Download all specified files
				for(var x=0;x<epub_info.urls.length;x++) {
					var filepath = epub_info.urls[x];

					requested++;
					httpGet( filepath, function(htm,url) {
						requested--;

						// Display percent
						var percent = Math.ceil((1-requested/epub_info.urls.length)*100) + "%";
						download_progress_label.innerHTML = "Downloading... ("+percent+")";

						downloads[url] = htm;

						if (requested == 0) {
							processDownloads();
						}
					},function() {
						requested--;
						err = true;

						if (requested == 0) {
							processDownloads();
						}
					});
				}

				// Step 3 - Organize the downloaded files; split up into parts etc
				function processDownloads() {
					if (err) {
						alert("Oh no! Something went wrong. Unable to download the specified documents. Try again, and if the problem persists, please report the issue to https://github.com/deathworlders/online.");
						return;
					}

					// Display percent
					download_progress_label.innerHTML = "Creating EPUB...";

					setTimeout(function() { // wait for 1 frame to give the label above time to update
						var total_files_processing = epub_info.urls.length;

						for(var x=0;x<epub_info.urls.length;x++) {
							(function(idx) {
								var url = epub_info.urls[idx];
								var htm = downloads[url];

								var parent = document.createElement("div");
								parent.innerHTML = htm;

								var requested_attachments = 0;

								// get the html
								var article = parent.getElementsByTagName( "article" )[0];

								function afterLoadingAttachments() {
									var text = article.innerHTML;

									// get the title and print it for debugging purposes
									//console.log("DOWNLOADED:",parent.getElementsByTagName("article")[0].getElementsByTagName("h1")[0].innerHTML);
									
									// The #333333 color is very annoying on some Kindle models so this removes the color tag completely on body text.
									css_file = css_file.replace("color: #333333;", "");

									// position:absolute; is not allowed in EPUB
									// blockquote::before contains this tag
									// so we'll just erase the whole thing
									css_file = css_file.replace(/blockquote::before *?{[^}]*?}/g,"");

									// and also replace any leftovers
									css_file = css_file.replace(/position:absolute;/g, "");

									// <br> tags usually don't have an end tag. xhtml requires end tags
									// so we replace it with <br/>
									text = text.replace(/<br>/g,"<br/>");

									// &nbsp; is not allowed in epub files
									text = text.replace(/&nbsp;/g," ");

									// <img> files must have a termination like <img />
									text = text.replace(/<img(.*?)>/g, "<img$1 />" );

									var ending = "";

									// Find the end of the chapter
									var endingFound = -1;
									var pt = /(<hr>[ \n]*?<hr>)/g
									do {
										var m = pt.exec(text);
										if (m && m.length > 0) {
											var startPos = m.index;

											// also ensure that the words "end" and "chapter" follow immediately after the double <hr>
											// so that double <hr> can be used elsewhere without breaking everything
											var temp = text.substring(startPos,startPos + 64).toLowerCase();
											if (temp.indexOf("end") != -1 && temp.indexOf("chapter") != -1) {
												endingFound = startPos;
												break;
											}
										}
									} while (m);

									if (endingFound != -1) {
										// Get everything from the chapter end point to the end of the document
										ending = text.substring(endingFound);

										// <hr> tags usually don't have an end tag. xhtml requires end tags
										ending = ending.replace(/<hr>/g,"<hr />");
										ending = ending.trim();

										// Erase everything from text after the ending part
										text = text.substring(0,endingFound);
									} else {
										// Assume this chapter doesn't have an ending section
										ending = "";
									}

									var texts_before_adding = texts.length;
									
									// Now split the text on each <hr>
									var t = text.split("<hr>");
									for(i=0;i<t.length;i++) {
										if (t[i].trim() == "") {continue;}
										texts.push(t[i]);
									}

									var custom_ending = "<hr /><hr /><p><strong>++END CHAPTER++</strong></p><hr /><hr />";
									if (ending == "") {ending = custom_ending;}

									// check how many urls we're loading add chapter locations
									if (epub_info.urls.length == 1) {
										// only one url specified

										// add ending to main body of text
										texts.push(ending);

										// add all to chapters
										for(i=0;i<texts.length;i++) {
											chapters.push(i); 
										}
									} else {
										// many urls specified

										// add ending as a separate file
										// and include a link to it
										// as long as this isn't the final chapter
										if (ending != custom_ending && idx < epub_info.urls.length) {
											separate_files.push(ending);
											var str = custom_ending;
											str += "<br /><a href='part_extra_"+prefixZeroes(separate_files.length)+".xhtml'>Click here to check out the amazing Patrons who supported this chapter.</a>";
											texts.push(str);
										} else {
											texts.push(ending);
										}

										// add only one chapter for each actual chapter
										chapters.push(texts_before_adding);
									}

									total_files_processing--;
									if (total_files_processing == 0) {
										// all attachments downloaded, continue
										onRequestsFinished();
									}
								}

								// Find all image tags to attach the images to the resulting epub
								var imgs = article.getElementsByTagName("img");
								if (imgs.length == 0) {
									// no attachments found, proceed immediately
									afterLoadingAttachments();
								} else {
									for(let y=0;y<imgs.length;y++) {
										requested_attachments++;
										total_files_processing++;
										let src = imgs[y].getAttribute("src"); // do not use ".src" here
										if (!src.startsWith( "http://" ) && !src.startsWith( "https://" )) {
											// if the url is not an absolute url, prepend the current folder to handle relative paths properly
											src = url + src;
										}

										httpGet(src,function(blob) {
											separate_files.push(blob);

											// update the src to their new name
											imgs[y].src = "part_extra_" + prefixZeroes(separate_files.length) + "." + blob.type.split("/")[1];

											requested_attachments--;
											total_files_processing--;
											if (requested_attachments == 0) {
												afterLoadingAttachments();
											}
										},function() {
											requested_attachments--;
											total_files_processing--;
											err = true;
											if (requested_attachments == 0) {
												afterLoadingAttachments();
											}
										},true);
									}
								}
							})(x);
						}
					},1);
				}

				// Step 4 - Zip 'em up and download
				function onRequestsFinished() {
					if (err) {
						alert("Oh no! Something went wrong. Unable to download the specified documents. Try again, and if the problem persists, please report the issue to https://github.com/deathworlders/online.");
						return;
					}

					// zip time
					var zip = new JSZip();
					zip.file("mimetype","application/epub+zip");

					// content folder
					var content = zip.folder( "content" );
					
					// add content files
					var files = [];
					var files_extra = [];
					for(var i=0;i<texts.length;i++) {
						var text = texts[i];
						var filename = "part_" + prefixZeroes(i+1) + ".xhtml";
						var html = buildFile( text );
						content.file( filename, html );
						files.push(filename);
					}

					// add separate files
					for(var i=0;i<separate_files.length;i++) {
						var text = separate_files[i];
						if (typeof text == "string") {
							var filename = "part_extra_"+prefixZeroes(i+1)+".xhtml";
							var html = buildFile(text);
							content.file(filename,html);
							files_extra.push({filename:filename,type:"application/xhtml+xml"});
						} else if (text instanceof Blob) {
							var filename = "part_extra_"+prefixZeroes(i+1)+"."+text.type.split("/")[1];
							content.file(filename,text);
							files_extra.push({filename:filename,type:text.type});
						}
					}

					// Handle cover image
					var cover_filetype = "";
					if (cover_image && typeof cover_image != "undefined") {
						cover_filetype = "jpeg";
						content.file( "cover." + cover_filetype, cover_image );
						content.file( "cover.xhtml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"+
														"<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">"+
														"<head><title>Deathworlders.com</title>"+
														"<meta charset=\"utf-8\"/></head>"+
														"<body><img src=\"cover."+cover_filetype+"\"/></body></html>" );
					}

					content.file( "info.opf", 
						buildOPF(
							epub_info.title,
							epub_info.author,
							epub_info.date,
							files,
							files_extra,
							cover_filetype
						)
					);

					var encode_elem = document.createElement("div");

					// build nav file contents
					var nav = ["<nav epub:type=\"toc\" id=\"toc\"><ol>"];
					for(var i=0;i<chapters.length;i++) {
						var filename = files[chapters[i]];
						var title = "Part " + (i+1);
						if (epub_info.titles && epub_info.titles[i]) {
							// use encode_elem to encode the title (escape html special chars such as "<>&" etc)
							encode_elem.innerHTML = epub_info.titles[i];
							title = encode_elem.innerHTML;
						}
						nav.push( "<li><a href=\"" + filename + "\">" + title + "</a></li>" );
					}
					nav.push("</ol></nav>");

					// add nav file
					content.file( "nav.xhtml", buildFile(nav.join("\n"),true));

					// Meta folder
					var meta = zip.folder( "META-INF" );
						meta.file( "container.xml", buildContainerXML() );

					// CSS folder
					var css = content.folder( "css" );
						css.file( "css.css", css_file );

					zip.generateAsync({type:"blob"}).then(function(content) {
						// delete all non-alphanumeric characters in the title to use it as the file name
						var filename = epub_info.story_title.replace( /[^a-zA-Z0-9]/g, "" );
						if (epub_info.title != epub_info.story_title) {filename += epub_info.title.replace( /[^a-zA-Z0-9]/g, "" );}
						saveAs(content,filename+".epub");
					});

					onFinished();
				}
			}, function() {
				alert( "Oh no! Couldn't get the CSS file. Try again, and if the problem persists, please report the issue to https://github.com/deathworlders/online." );
			});
		} catch( error ) {
			alert( "Oh no! Something went wrong. Maybe your browser doesn't support the features required to generate an EPUB file?" +
					" Try it with a different browser. I've tested it in Chrome myself. Otherwise, report the issue to https://github.com/deathworlders/online."+
					" Here is the error message: '" + error.toString() + "'" );
		}
	}

	// Make this function globally accessible
	window.downloadEPUB = downloadEPUB;
})();
