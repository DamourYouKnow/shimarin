import * as Discord from 'discord.js';
import http from 'axios';
import { Helpers } from './helpers';
import { type } from 'node:os';


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
    type: MediaListType,
    status: MediaListStatus
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
    chapters: number | null
    episodes: number | null
}

type MediaListType = 'ANIME' | 'MANGA';

type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED'
    | 'PAUSED' | 'REPEATING';

commands.add({name: 'watching'}, async (message, username) => {
    const mediaList = await getMediaList(username, 'ANIME', 'CURRENT');
    message.channel.send(mediaListEmbed(mediaList));
});

commands.add({name: 'reading'}, async (message, username) => {
    const mediaList = await getMediaList(username, 'MANGA', 'CURRENT');
    message.channel.send(mediaListEmbed(mediaList));
});

commands.add({name: 'list'}, async (message, username, ...args) => {
    const argSet = new Set(args);
    
    let type: MediaListType = 'ANIME';
    if (argSet.has('manga')) type = 'MANGA';

    let status: MediaListStatus = 'COMPLETED';
    if (argSet.has('watching')) status = 'CURRENT';
    if (argSet.has('dropped')) status = 'DROPPED';
    if (argSet.has('planned')) status = 'PLANNING';

    const mediaList = await getMediaList(username, type, status);
    message.channel.send(mediaListEmbed(mediaList));
});

async function getMediaList(
    username: string,
    type: MediaListType,
    status: MediaListStatus
): Promise<MediaList> {
    const query = `
    query ($username: String, $type: MediaType, $status: MediaListStatus) {
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
                type: $type,
                status: $status
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
                    chapters
                }
                progress
            }
        }
    }
    `; 
    const response = await http.post('https://graphql.anilist.co', {
        query: query,
        variables: {
            username: username,
            type: type,
            status: status
        }
    });
    const results = response.data.data.Page.mediaList;
    // FIXME: user will not be returned if media list is empty.
    const user = results[0]?.user;
    return {
        user: user as AniListUser,
        entries: results as MediaListItem[],
        type: type,
        status: status
    }
}

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
    };

    const user = mediaList.user;
    const profileColor = mediaList.user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.entries.map((entry) => {
        const media = entry.media;
        const resource = `${mediaList.type.toLowerCase()}/${entry.media.id}/`;
        const url = `https://anilist.co/${resource}`;
        const maxCount = { 
            'ANIME': media.episodes, 'MANGA': media.chapters
        }[mediaList.type];
        const count = `${entry.progress} / ${maxCount || '?'}`;
        const title = media.title.english
            || media.title.romaji 
            || media.title.native
        return {
            name: title,
            value: `${count.padEnd(15, ' ')}[Link](${url})`
        }
    });

    const listLabels: {
        [type in MediaListType]: {[status in MediaListStatus]: string}
    } = {
        'ANIME': {
            'COMPLETED': 'completed anime list',
            'CURRENT': 'watchlist',
            'DROPPED': 'dropped anime list',
            'PAUSED': 'paused anime list',
            'PLANNING': 'plan to watch list',
            'REPEATING': 're-watching list'
        },
        'MANGA': {
            'COMPLETED': 'completed manga list',
            'CURRENT': 'readlist',
            'DROPPED': 'dropped manga list',
            'PAUSED': 'paused manga list',
            'PLANNING': 'plan to read list',
            'REPEATING': 're-reading list'
        }
    };

    return new Discord.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[mediaList.type][mediaList.status]}`,
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
