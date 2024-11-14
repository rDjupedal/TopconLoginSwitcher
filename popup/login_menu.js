const RECENT_NUM = 5;
const TOPCON_DOMAINS = ["topcon.com", "topconpositioning.com"];
const recent = new Array(RECENT_NUM);
const customerTable = document.getElementById("customerTable");
const logOutBtn = document.getElementById("logOutBtn");
const editBtn = document.getElementById("editBtn");
const recentTable = document.getElementById("recentTable");
const filterTextBox = document.getElementById("textFilter");
const recentP = document.getElementById("recentP");

logOutBtn.addEventListener("click", logOut);
editBtn.addEventListener('click', function(){ location.href='edit.html' });

filterTextBox.addEventListener("input",function() {
    customerTable.innerHTML = "";
    updateList(filterTextBox.value);    
});

// Make the filter text box active default
filterTextBox.focus();

// Load customers from storage
let customers = [];
readLogins().then((readCustomers) => {

    // Sort the customers alphabetically
    customers = readCustomers.sort((a, b) => {
        return a.customer.localeCompare(b.customer);
    })

    // Clear the Table
    customerTable.innerHTML = "";
    updateList();
});

// Load recent customers from storage
browser.storage.local.get("recent").then((r) => {
    console.log("read recent from storage: " + JSON.stringify(r));

    if (r.recent) {
        const data = JSON.parse(r.recent);
        for (let i = 0; i < RECENT_NUM; i++) {
            recent[i] = data[i];
        }
    }

    updateRecent();
});

/**
 * Clear and refresh the list of recent customers
 */
function updateRecent() {
    recentTable.innerHTML = "";
    for (let i = 0; i < recent.length; i++) {
        if (!recent[i]) continue;
        const a = document.createElement("a")
        const link = document.createTextNode(recent[i].customer);
        a.appendChild(link);
        a.title = recent[i].customer;
        a.addEventListener("click", e => login(recent[i]));
        
        const col = document.createElement("th");
        col.appendChild(a);
        const row = document.createElement("tr");
        row.appendChild(col);
        recentTable.appendChild(row);
    }

    recentP.hidden = (recentTable.innerHTML.length === 0);
}

/**
 * Add a customer to the top of recent logins
 * @param newEntry new login to add
 */
function addToRecent(newEntry) {

    let moveToIndex = recent.length - 1;

    // Check if already exists
    for (let i = 0; i < RECENT_NUM; i++) {
        if (recent[i] && recent[i].username === newEntry.username) {
            moveToIndex = i;
        }
    }

    // Move every entry down one step
    for (let i = moveToIndex; i > 0; i--) {
        recent[i] = recent[i - 1];
    }

    // Add the new entry to the top of the list
    recent[0] = newEntry;
    browser.storage.local.set( {"recent" : JSON.stringify(recent)} );
}

/**
 * Get stored login credentials from browser storage
 * @returns {Promise<any>}
 */
async function readLogins() {

    let customers = await browser.storage.local.get("customers")
        .then((customers) => {
            return customers.customers;
        });
        
    return JSON.parse(customers);
}

/**
 * Populate a list of customers links
 * @param filter
 * @returns {Promise<void>}
 */
async function updateList(filter) {

    // If no filter is used show recent logins
    if (!filter) updateRecent();

    for (let customer of customers) {

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

/**
 * Do the whole process of logging out of any current session and then logging into the chosen one
 * @param customer
 * @returns {Promise<void>}
 */
async function login(customer) {

    addToRecent(customer);
    updateRecent();

    await logOut();
    await closeTab();
    browser.tabs.create({});

    const credentials = {
        username : customer.username,
        password : customer.password
    }

    const START_URL = "https://sitelink.topcon.com/login";
    const BASE_URL = "https://token.us.auth.topcon.com"

    /**
     * Chain of Promises. Any return vale of Promise.reject() will exit the chain and go to the catch exception
     * line at the end.
     * Each new Promise has the purpose of gathering data (cookies, id's, url's, etc.) and advance the login session
     * for the next request, with the final goal to log in as a "real" user.
     */

    fetch(START_URL)
        .then(response => {
            if (!response.ok) return Promise.reject("Failed to connect to " + START_URL);
            return Promise.resolve(response.text());
        })

        .then(html => {
        const postUrl = BASE_URL + html.match(/action="([^"]+)"/)[1];
        return fetch(postUrl, {
            method: "POST",
            body: "subject=" + customer.username + "&clear.previous.selected.subject=&cancel.identifier.selection=false",
            headers: {"Content-Type": "application/x-www-form-urlencoded"}
            });
        })

        .then(response => {
            if (response.ok) return Promise.resolve(response.text());
            else return Promise.reject(response.statusText);
        })

        .then(html => {
            const ref = html.match(/<input type="hidden".*name="REF".*value="(.*)"/)[1];
            const connId = html.match(/<input type="hidden".*name="connectionId".*value="(.*)"/)[1];
            const resumePath = html.match(/<input type="hidden".*name="resumePath".*value="(.*)"/)[1];
            console.log(ref + "\n" + connId + "\n" + resumePath);
            const body = `REF=${ref}&allowInteraction="true"&connectionId=${connId}&resumePath=${resumePath}&reauth="false"`;
            const url = "https://pfadapters.us.auth.topcon.com/choose_idp";
            console.log("Getting flow id..");

            return fetch(url, {
                method: "POST",
                body: body,
                headers: {"Content-Type": "application/x-www-form-urlencoded"}
            });
        })

        .then(response => {
            if (!response.ok) return Promise.reject("Problem getting FlowId\n" + response.statusText);

            const flowId = response.url.match(/flowId=(.*)/)[1];

            // Send credentials
            const postUrl = "https://id.auth.topcon.com/flows/" + flowId;

            return fetch(postUrl, {
                method: "POST",
                body: JSON.stringify(credentials),
                headers: {"Content-Type": "application/vnd.pingidentity.usernamePassword.check+json"}
            });
        })

        .then((data) => {
            if (!data.ok) {
                data.json().then(t => {
                    const detailedErr = t["details"][0]["message"];
                    console.error(`Error logging in as ${customer.username}!\n` + (detailedErr? detailedErr : ""));
                });
                return Promise.reject("See console log for details")
            }

            return Promise.resolve(data.json());
        })

        .then((json) => {
            // Get the current tab and load the redirect page
            const redirectUrl = json.resumeUrl;
            browser.tabs.query({currentWindow: true, highlighted: true}).then((tabs) => {
                const tabId = tabs[0].id;
                browser.tabs.update(tabId, {url: redirectUrl});
                window.close();
            });

        })

        .catch(error => {
            alert("An error occurred:\n" + error);
            console.error(error);
        })

}

async function logOut() {
    console.log("logging out..")

    // REMOVE ALL TOPCON RELATED COOKIES
    for (let domain of TOPCON_DOMAINS) await clearCookies(domain);
}

async function closeTab() {
    browser.tabs.query({ currentWindow: true, highlighted : true }).then((x) => {
        console.log(x[0]);
        browser.tabs.remove(x[0].id);
    })
}

/**
 * Remove all cookies related to a domain
 * @param domain
 * @returns {Promise<void>}
 */
async function clearCookies(domain) {

    browser.cookies.getAll( {domain: domain} )
    .then(cookies => {
        console.log("found " + cookies.length + " cookies for " + domain);

        if (cookies.length === 0) return;

        for (let cookie of cookies) {
            browser.cookies.remove({
                name: cookie.name,
                url: `https://${cookie.domain}${cookie.path}`
            });
        }})
    .catch(err => {
        alert(`Cokkie error:\n${err}`)
        console.error(`Cookie error:\n${err}`);
        return Promise.reject(err);
    });
}