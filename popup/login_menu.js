const RECENT_NUM = 5;

console.log("login_menu loaded..");
// Uncomment temp to clear saved data
//browser.storage.sync.clear();

const logOutBtn = document.getElementById("logOutBtn");
logOutBtn.addEventListener("click", logOut);

const filterTextBox = document.getElementById("textFilter");
filterTextBox.addEventListener("input", e => {
    customerTable.innerHTML = "";
    updateList(filterTextBox.value);    
});

// Make the filter text box active default
filterTextBox.focus();

// Load customers from storage
var customers = [];
readLogins().then((readCustomers) => {
    //customers = readCustomers;

    // Sort the customers alphabetically
    customers = readCustomers.sort((a, b) => {
        return a.customer.localeCompare(b.customer);
    })

    // Clear the Table
    customerTable.innerHTML = "";
    updateList();
});

// Load recent customers from storage
var recent = new Array(RECENT_NUM);
readRecent().then((recentC) => {
    //if (recentC) this.recent = JSON.parse(recentC.recent);
    if (recentC) data = JSON.parse(recentC.recent);

    for (let i = 0; i < RECENT_NUM; i++) {
        this.recent[i] = data[i];
    }

    recentTable.innerHTML = "";
    updateRecent();
})

async function readRecent() {
    let recent = await browser.storage.local.get("recent")
        .then((r) => {
            //console.log("read recent from storage: " + JSON.stringify(r));
            if (r) return r;
        })
    return recent;
}

function updateRecent() {
    //console.log("update recent called, recent: " + JSON.stringify(recent));

    let recentTable = document.getElementById("recentTable");
    recentTable.innerHTML = "";
    for (let i = 0; i < recent.length; i++) {

        if (!recent[i]) continue;
        let a = document.createElement("a")
        let link = document.createTextNode(recent[i].customer);
        a.appendChild(link);

        a.title = recent[i].customer;
        a.addEventListener("click", e => { login(recent[i]); })
        
        let col = document.createElement("th");
        col.appendChild(a);
        let row = document.createElement("tr");
        row.appendChild(col);
        //customerTable.prepend(row);
        recentTable.appendChild(row);
    }
    
}

function addToRecent(newEntry) {

    let moveUntilIndex = recent.length - 1;

    // Check if already exists
    for (i = 0; i < RECENT_NUM; i++) {
        if (recent[i] && recent[i].username === newEntry.username) {
            moveUntilIndex = i;
        }
    }

    //Move every entry down one step
    for (i = moveUntilIndex; i > 0; i--) {
        recent[i] = recent[i - 1];
    }

    // Add the new entry to the top of the list
    recent[0] = newEntry;
    browser.storage.local.set( {"recent" : JSON.stringify(recent)} );

}

async function readLogins() {

    let customers = await browser.storage.local.get("customers")
        .then((customers) => {
            return customers.customers;
        });
        
    return JSON.parse(customers);
}

// Populate a list of customers links
async function updateList(filter) {

    // If no filter is used show recent logins
    if (!filter) updateRecent()
    else recentTable.innerHTML = "";

    customerTable = document.getElementById("customerTable");

    for (let customer of customers) {
        //console.log("creating: " + JSON.stringify(customer));
                
        if (filter && !customer.customer.toLowerCase().includes(filter.toLowerCase())) { continue; }

        let a = document.createElement("a")
        let link = document.createTextNode(customer.customer);
        a.appendChild(link);

        a.title = customer.customer;
        a.addEventListener("click", e => { login(customer); })
        
        let col = document.createElement("th");
        col.appendChild(a);
        let row = document.createElement("tr");
        row.appendChild(col);
        customerTable.appendChild(row);  
    }

}

async function login(customer) {

    addToRecent(customer);
    updateRecent();

    await logOut();
    closeTab();
    
    console.log("logging in..")
    
    browser.tabs.create({});

    const cred = {
        username : customer.username,
        password : customer.password
    }


    console.log("Getting flow id..");
    const url = "https://sitelink.topcon.com/login";
    const baseUrl = "https://token.us.auth.topcon.com"
    const srchExp = `form method="POST" action="`;
    const data = {
        subject : customer.username,
        "clear.previous.selected.subject" : "",
        "cancel.identifier.selection" : false
    }

    try {

        fetch(url).then(response => {
            console.log(typeof(response) + "\n" + response);
            //const html = response.text();
            response.text().then(html => {
                const startIndex = html.indexOf(srchExp) + srchExp.length;
                const endIndex = html.indexOf(`"`, startIndex);
                const posturl = baseUrl + html.substring(startIndex, endIndex);
                console.log(posturl);

                fetch(posturl, {
                    method: "POST",
                    //body: data,
                    body: "subject=" + customer.username + "&clear.previous.selected.subject=&cancel.identifier.selection=false",
                    headers: {"Content-Type" : "application/x-www-form-urlencoded"}
                }).then(response => {
                    //console.log(response.status);
                    if (!response.ok) console.log(response.statusText);
                    response.text().then(html => {
                        //console.log(html);
                        const ref = html.match(/<input type="hidden".*name="REF".*value="(.*)"/)[1];
                        const connId = html.match(/<input type="hidden".*name="connectionId".*value="(.*)"/)[1];
                        const resumePath = html.match(/<input type="hidden".*name="resumePath".*value="(.*)"/)[1];
                        console.log(ref+ "\n" + connId + "\n" + resumePath);
                        let t = `test` + ref;
                        const body = `REF=` + ref + `&allowInteraction="true"&connectionId=` + connId + `&resumePath=${resumePath}&reauth="false"`;
                        const url = "https://pfadapters.us.auth.topcon.com/choose_idp";
                        fetch(url, {
                            method: "POST",
                            body: body,
                            headers: {"Content-Type": "application/x-www-form-urlencoded"}
                        }).then(response => {
                            if (!response.ok) console.log(response.statusText);
                            console.log(response.status);
                            console.log(response.url);
                            const flowId = response.url.match(/flowId=(.*)/)[1];
                            console.log(flowId);
                            response.text().then(html => {
                                console.log(response);
                            })


                            // Send credentials
                            const postUrl = "https://id.auth.topcon.com/flows/" + flowId;

                            fetch(postUrl, {
                                method: "POST",
                                body: JSON.stringify(cred),
                                headers: {"Content-Type" : "application/vnd.pingidentity.usernamePassword.check+json"}
                            })
                                .then((data) => {
                                    console.log("Login status: " + data.statusText);
                                    if (data.status !== 200) {
                                        const sDiv = document.getElementById("statusDiv")            ;
                                        sDiv.innerHTML = "Error logging in as " + customer.username + "!";
                                        return;
                                    }

                                    return data.json();
                                })
                                .then((json) => {
                                    //console.log("finally: " + JSON.stringify(json))
                                    let redirectUrl = json.resumeUrl;
                                    console.log(redirectUrl);

                                    // Get the current tab and load the redirect page
                                    browser.tabs.query({ currentWindow: true, highlighted : true }).then((x) =>
                                    {
                                        const tabId = x[0].id;
                                        browser.tabs.update(tabId, {url : redirectUrl} );
                                        window.close();
                                    })
                                });

                        });
                    });
                })
            })

        })

    } catch (error) {
        console.error(error.message);
        console.log(error);
    }

    /*


    // Send credentials
    const postUrl = "https://id.auth.topcon.com/flows/" + flowId;

    fetch(postUrl, {
        method: "POST",
        body: JSON.stringify(cred),
        headers: {"Content-Type" : "application/vnd.pingidentity.usernamePassword.check+json"}
    })
    .then((data) => {
        console.log("Login status: " + data.statusText);
        if (data.status != 200) {
            const sDiv = document.getElementById("statusDiv")            ;
            sDiv.innerHTML = "Error logging in as " + customer.username + "!";
            return;
        }
        
        return data.json();
    })
    .then((json) => {
        //console.log("finally: " + JSON.stringify(json))
        let redirectUrl = json.resumeUrl;
        console.log(redirectUrl);
        
        // Get the current tab and load the redirect page
        browser.tabs.query({ currentWindow: true, highlighted : true }).then((x) => 
        {
            const tabId = x[0].id;
            browser.tabs.update(tabId, {url : redirectUrl} );
            window.close();
        })
    });


     */
}

async function getFlowId() {
	
	console.log("Getting flow id..");
    const url = "https://sitelink.topcon.com/login";
	
	try {
		
		const response = await fetch(url);
		if (!response.ok) {
			console.log("ERROR")
			throw new Error(`Response status: ${response.status}`);
		}
		
		// Search retrieved HTML for path
		const html = await response.text();
        console.log(typeof(html));
		console.log(html);
		const startIndex = html.indexAt(`form method="POST" action="`);
		console.log("index: " + startIndex);
		
	} catch (error) {
		console.error(error.message);
		console.log(error);
	}
	
	
    
	//let data = await window.fetch(url);
	//console.log("response from fetch request:\n" + data);
	/*
	for (i in data) {
		console.log(i + ":\t" + data[i]);
	}
	*/
	console.log("response status: " + data.status);
	console.log("rjson:\t" + data.json);
  
	//let json = await data.json();
	//console.log(json);
	//console.log(data.json());
    //return data.url.split("flowId=")[1];
	return "dummy";
}

async function logOut() {
    console.log("logging out..")

    // REMOVE ALL TOPCON RELATED COOKIES
    clearCookies("topcon.com");
    clearCookies("topconpositioning.com");
}

async function closeTab() {
    browser.tabs.query({ currentWindow: true, highlighted : true }).then((x) => 
        {
            console.log(x[0]);
            browser.tabs.remove(x[0].id);
        })
}

async function clearCookies(domain) {

    // FIND COOKIES
    let cookieList = [];
    browser.cookies.getAll( {domain: domain} )
    .then(cookies => {
        if (cookies.length > 0) {
            console.log("found " + cookies.length + " cookies");   
            
            for (let cookie of cookies) {
                let c = { 
                    name : cookie.name,
                    url  : "https://" + cookie.domain + cookie.path 
                }

                console.log(c);
                cookieList.push(c);
            }
        }

        else console.log("no cookie found for domain " + domain);


        // REMOVE COOKIES
        console.log("Removing " + cookieList.length + " cookies..");
        for (let removeCookie of cookieList) {

            browser.cookies.remove(removeCookie)
                .then((result) => console.log("Removed " + removeCookie.url));
        }
    })


}
