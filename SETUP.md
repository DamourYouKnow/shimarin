### Setup
1. Install [Node.js](https://nodejs.org/en/)

2. Install dependencies with `npm install`.

3. Set `DISCORD_API_TOKEN` environment variable or add token to `config.yml`.

4. Some features require an AniList API client which can be created 
[here](https://anilist.co/settings/developer). Set your API client ID in the 
`config.yml` file and set your API client secret using the `ANILIST_API_SECRET` 
environment variable or by adding it in the `config.yml` file.

5. Some features require connecting to a MongoDB database which can be 
downloaded [here](https://www.mongodb.com/try/download/community). Your 
development database should be running on the default `localhost:27019` port.

6. Run with `npm start`
