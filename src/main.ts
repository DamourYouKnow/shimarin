import * as Discord from 'discord.js';
import * as AniList from './anilist';
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

class EmbedNavigator {
    message: Discord.Message;
    navigatingUser: Discord.User;
    pageInfo: AniList.PageInfo;
    generatePage: (page: number) => Promise<Discord.MessageEmbed>;

    constructor(
        message: Discord.Message,
        navigatingUser: Discord.User,
        pageInfo: AniList.PageInfo,
        generatePage: (page: number) => Promise<Discord.MessageEmbed>
    ) {
        this.message = message;
        this.navigatingUser = navigatingUser;
        this.pageInfo = pageInfo;
        this.generatePage = generatePage;
    }

    async listen() {
        const previousBtn = await this.message.react('⬅️');
        const nextBtn = await this.message.react('➡️');
        const filter: Discord.CollectorFilter = () => true;
        const collector = this.message.createReactionCollector(filter, {
            dispose: true
        });

        const navigatingUser = this.navigatingUser;
        const handleReaction = (
            reaction: Discord.MessageReaction,
            user: Discord.User
        ) => {
            if (user != navigatingUser) return;
            if (reaction == nextBtn) this.next();
            if (reaction == previousBtn) this.previous();
        };

        collector.on('collect', handleReaction);
        collector.on('remove', handleReaction);
    }

    async next() {
        if (this.pageInfo.currentPage < this.pageInfo.lastPage) {
            this.pageInfo.currentPage += 1;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
        }
    }

    async previous() {
        if (this.pageInfo.currentPage > 0) {
            this.pageInfo.currentPage -= 1;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
        }
    }
}

commands.add({name: 'watching'}, async (message, username) => {
    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(
        user.id,
        'ANIME',
        'CURRENT'
    );
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(
                    user.id,
                    'ANIME',
                    'CURRENT',
                    page
                )
            );
        }
    ).listen();
});

commands.add({name: 'reading'}, async (message, username) => {
    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(
        user.id,
        'MANGA',
        'CURRENT'
    );
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(
                    user.id,
                    'MANGA',
                    'CURRENT',
                    page
                )
            );
        }
    ).listen();
});

commands.add({name: 'list'}, async (message, username, ...args) => {
    const argSet = new Set(args);
    
    let type: AniList.MediaListType = 'ANIME';
    if (argSet.has('manga')) type = 'MANGA';

    let status: AniList.MediaListStatus = 'COMPLETED';
    if (argSet.has('watching')) status = 'CURRENT';
    if (argSet.has('dropped')) status = 'DROPPED';
    if (argSet.has('planned')) status = 'PLANNING';

    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(user.id, type, status, 0);
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(user.id, type, status, page)
            )
        }
    ).listen();
});

function mediaListEmbed(
    user: AniList.User,
    mediaList: AniList.MediaListPage
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

    const profileColor = user.options.profileColor || '#dec027';
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
        [type in AniList.MediaListType]: {
            [status in AniList.MediaListStatus]: string
        }
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

    const currentPage = mediaList.pageInfo.currentPage;
    const lastPage = mediaList.pageInfo.lastPage;

    return new Discord.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[mediaList.type][mediaList.status]}`,
        url: `https://anilist.co/user/${user.name}/animelist/Watching`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields,
        footer: {
            text: `Page ${currentPage} / ${lastPage}`
        }
    });
}

async function sleep(time: number) {
    return new Promise((resolve, _) => {
        setTimeout(resolve, time);
    });
}

// Pass messages to message handler.
client.on('message', (message) => {
    Helpers.messageHandler(commands, message);
});

Helpers.login(client);
