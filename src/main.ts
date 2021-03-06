import * as Discord from 'discord.js';
import http from 'axios';
import { Helpers } from './helpers';


const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

const commands = new Helpers.Commands();

// Add your commands here...
commands.add({name: 'ping'}, (message) => {
    message.channel.send('pong!');
});

interface AniListUser {
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
}
interface MediaList {
    user: AniListUser,
    type: 'ANIME' | 'MANGA',
    entries: MediaListItem[]
}

interface MediaListItem {
    media: Media,
    progress: number | null;
}

interface Media {
    id: number,
    title: {
        english: string | null,
        romaji: string | null,
        native: string | null
    },
    episodes: number | null
}

commands.add({name: 'watching'}, async (message, username) => {
    const query = `
    query ($username: String ) {
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
                sort: [UPDATED_TIME_DESC]
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
                        romaji
                        native
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
        // FIXME: user will not be returned if media list is empty.
        const user = results[0]?.user;
        const mediaList: MediaList = {
            user: user as AniListUser,
            entries: results as MediaListItem[],
            type: 'ANIME'
        };
        message.channel.send(mediaListEmbed(mediaList));
    } catch (err) {
        console.error(err);
    }
});

function mediaListEmbed(
    mediaList: MediaList
): Discord.MessageEmbed {
    const colors: {[color: string]: string}  = {
        'blue': '#3db4f2',
        'purple': '#c063ff', 
        'pink': '#fc9dd6',
        'orange': '#ef881a',
        'red': '#e13333', 
        'green': '#4cca51',
        'gray': '#677b94'
    }

    const user = mediaList.user;
    const profileColor = mediaList.user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.entries.map((entry) => {
        const media = entry.media;
        const url = `https://anilist.co/anime/${entry.media.id}/`;
        const count = `${entry.progress} / ${entry.media.episodes || '?'}`;
        const title = media.title.english
            || media.title.romaji 
            || media.title.native
        return {
            name: title,
            value: `${count.padEnd(15, ' ')}[Link](${url})`
        }
    });

    return new Discord.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s watchlist`,
        url: `https://anilist.co/user/${user.name}/animelist/Watching`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields
    });
}

// Pass messages to message handler.
client.on('message', (message) => {
    Helpers.messageHandler(commands, message);
});

Helpers.login(client);
