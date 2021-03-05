const Discord = require('discord.js');
const http = require('axios');
const helpers = require('./helpers.js');

const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

const commands = new helpers.Commands();

// Add your commands here...
commands.add({name: 'ping'}, (message) => {
    message.channel.send('pong!');
});

commands.add({name: 'watching'}, async (message, username) => {
    const query = `
    query ($username: String) {
        Page (page: 1, perPage: 10) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
            }
            mediaList (
                userName: $username,
                type: ANIME,
                status: CURRENT
            ) {
                user {
                    name
                    options {
                        profileColor
                    }
                    avatar {
                        medium
                    }
                }
                media {
                    id
                    title {
                        english
                    }
                    episodes
                }
                progress
            }
        }
    }
    `;
    const variables = { username: username };
    try {
        const response = await http.post(
            'https://graphql.anilist.co',
            { query: query, variables: variables }
        );
        const results = response.data.data.Page.mediaList;
        const mediaList = results.map((item) => item.media);
        const user = results[0]?.user;

        const colors = {
            'blue': '#3db4f2',
            'purple': '#c063ff', 
            'pink': '#fc9dd6',
            'orange': '#ef881a',
            'red': '#e13333', 
            'green': '#4cca51',
            'gray': '#677b94'
        }
        const profileColor = user?.options.profileColor || '#dec027';
        const embedColor = profileColor.startsWith('#') ?
            profileColor : colors[profileColor];

        const fields = mediaList.map((media, i) => {
            return {
                name: media.title.english,
                value: `${results[i].progress} / ${media.episodes || '?'}`
            }
        });

        const embed = new Discord.MessageEmbed({
            color: embedColor,
            title: `${user.name}'s watchlist`,
            url: `https://anilist.co/user/${user.name}/animelist/Watching`,
            thumbnail: {
                url: user.avatar.medium,
            },
            fields: fields
        });
        message.channel.send(embed);
    } catch (err) {
        console.error(err);
    }
});

// Pass messages to message handler.
client.on('message', (message) => {
    helpers.messageHandler(commands, message);
});

helpers.login(client);
