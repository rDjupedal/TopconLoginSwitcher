const URL = "http://192.168.10.61/sl2_logins.json";
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const textBox = document.getElementById("editText");
const defaultBtn = document.getElementById("defaultBtn");
const loadServerBtn = document.getElementById("fromServerBtn");
const statusDiv = document.getElementById("statusDiv");

saveBtn.addEventListener("click", saveSettings);
clearBtn.addEventListener("click", clearData);
defaultBtn.addEventListener("click", defaultSettings);
loadServerBtn.addEventListener("click", loadFromServer);
document.addEventListener("DOMContentLoaded", loadSettings);

function clearData() {
    browser.storage.local.clear();
    setStatus("All data for this extension have been cleared");
    textBox.value = "";
}

function setStatus(status) {
    statusDiv.innerText = status;
}

async function loadFromServer() {
    setStatus("Loading from server..");

    fetch(URL, {cache : "reload"})
        .then((response) => { 
            if (response.ok) {
                response.json().then((data) => {
                    console.log(data);
                    textBox.value = JSON.stringify(data);
                    saveSettings();
                    setStatus("Successfully retrieved " + data.length + " customers from the server");
                });
            }

            if (response.status !== 200) setStatus("Error getting customers from server..");
        })
            .catch((err) => setStatus("Error getting customers from server.."));
}


function defaultSettings() {
    console.log("setting default..");

    const testCustomer = {
        "customer" : "Customer 1",
        "username" : "customer1@gmail.se",
        "password" : "123"
    }

    const testCustomer2 = {
        "customer" : "Customer 2",
        "username" : "customer2@shitmail.se",
        "password" : "456"
    }

    let customers = [];
    customers.push(testCustomer);
    customers.push(testCustomer2);
    textBox.value = JSON.stringify(customers);
}

function loadSettings() {
    console.log("loading settings..");

    browser.storage.local.get("customers")
    .then((customers) => {
        if (customers.customers) textBox.value = customers.customers;
    });
}

function saveSettings() {
    let customers = textBox.value;
    browser.storage.local.set( {"customers" : customers} );
    setStatus("Customers saved..");    
}