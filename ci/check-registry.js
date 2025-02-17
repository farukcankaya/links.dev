const fs = require('fs');
const yaml = require('yaml');
const axios = require('axios');
const path = require('path');

const crypto = require('crypto');

// Create a set to store the hashes of the pageJsonContent strings
const hashedContents = new Set();

async function validateRegistry() {
    // Read the registry.yaml file
    const isCI = process.env.CI;
    const registryPath = !isCI ? '../registry.yaml' : 'registry.yaml';
    const registryFileContent = fs.readFileSync(registryPath, 'utf8');
    let restrictedUsernamesPath = !isCI ? '../restricted-usernames.yaml' : 'restricted-usernames.yaml';
    const restrictedUsernamesFileContent = fs.readFileSync(restrictedUsernamesPath, 'utf8');
    const restrictedUsernames = yaml.parse(restrictedUsernamesFileContent).restricted_usernames;

    const registry = yaml.parse(registryFileContent);
    // Validate the structure of the registry
    if (!registry || !registry.users) {
        throw new Error('Invalid registry format. The "users" key is missing.');
    }
    // Validate each user
    for (const username in registry.users) {
        const user = registry.users[username];
        if (!user.github_username) {
            throw new Error(`Invalid registry format. The user "${username}" is missing the "github_username" field.`);
        }

        if (restrictedUsernames.includes(user.github_username)) {
            throw new Error(`The user "${username}" has a restricted username.`);
        }

        // Make a request to the user's page.json file
        const pageJsonUrl = `https://raw.githubusercontent.com/${user.github_username}/my-links/main/page.json`;
        console.log("Trying to retrieve " + pageJsonUrl);
        const pageJsonResponse = await axios.get(pageJsonUrl);


        if (pageJsonResponse.status !== 200) {
            throw new Error(`Failed to fetch page.json for user "${username}". HTTP status code: ${pageJsonResponse.status}`);
        }

        const pageJsonContent = pageJsonResponse.data;
        const hash = crypto.createHash('sha256').update(pageJsonContent).digest('hex');

        if (hashedContents.has(hash)) {
            console.error('pageJsonContent has already been processed.');
            process.exit(1);
        }

        hashedContents.add(hash);

        // Validate the structure of the page.json file
        if (!pageJsonContent || !pageJsonContent.name || !pageJsonContent.description || !pageJsonContent.image_url || !pageJsonContent.links) {
            throw new Error(`Invalid page.json format for user "${username}".`);
        }


        // Validate the image_url field
        try {
            const imageUrlResponse = await axios.get(pageJsonContent.image_url, {responseType: 'arraybuffer'});
            if (imageUrlResponse.status !== 200) {
                throw new Error(`Invalid image_url for user "${username}". HTTP status code: ${imageUrlResponse.status}`);
            }
        } catch (e) {
            console.warn(`Invalid image_url for user "${username}".`);
        }


    }
    console.log('Registry validation successful.');
}

async function main() {
    try {
        await validateRegistry();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}


main();