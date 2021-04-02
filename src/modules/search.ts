import * as Discord from 'discord.js';
import { Bot, Module, MessageCollector, MessageEmbed } from '../bot';
import * as AniList from '../anilist';

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'search',
            help: {
                shortDesc: 'Search for information about an anime or manga',
                arguments: {
                    'title': 'Anime or manga title'
                },
                examples: [`search yuru camp`]
            }
        }, async (message) => {
            await mediaSearch(bot, message);
        });
    
        this.addCommand({
            name: 'anime',
            help: {
                shortDesc: 'Search for information about an anime',
                arguments: {
                    'title': 'Anime title'
                },
                examples: ['anime yuru camp']
            }
        }, async (message) => {
            await mediaSearch(bot, message, 'ANIME');
        });
        
        this.addCommand({
            name: 'manga',
            help: {
                shortDesc: 'Search for information about a manga',
                arguments: {
                    'title': 'Manga title'
                },
                examples: [`manga komi can't communicate`]
            }
        }, async (message) => {
            await mediaSearch(bot, message, 'MANGA');
        });
    }
}

async function mediaSearch(
    bot: Bot,
    message: Discord.Message,
    type?: AniList.MediaType
) {
    const search = message.content.split(' ').slice(1).join(' ');
    if (!search) {
        await bot.sendError(
            message.channel,
            `No ${type.toLowerCase()} title was provided.`
        );
        return;
    }
    const viewer = await AniList.getViewer(message.author.id);
    const mediaSearchView = await AniList.getMediaSearchPage(
        search,
        { type: type },
        0,
        viewer
    );
    const results = mediaSearchView.content.items;
    if (results.length == 0) {
        await bot.sendEmbed(
            message.channel,
            'No results found',
            'Double check your search query and try again.'
        );
        return;
    }
    if (results.length == 1) {
        await message.channel.send(mediaEmbed(bot, {
            content: results[0],
            viewer: viewer
        }));
        return;
    }
    const response = await message.channel.send(mediaSearchEmbed(
        bot,
        mediaSearchView
    ));
    const collector = new MessageCollector(message.channel, message.author);
    collector.onReply = (reply) => {
        const selected = Number(reply.content);
        if (!isNaN(selected) && selected >= 1 && selected <= results.length) {
            response.edit(mediaEmbed(bot, {
                content: results[selected-1],
                viewer: viewer
            })).catch(console.error);
        }
    };
}

function mediaEmbed(
    bot: Bot,
    mediaView: AniList.View<AniList.Media>
): Discord.MessageEmbed {
    const media = mediaView.content;
    return new MessageEmbed({
        title: AniList.mediaDisplayTitle(media.title),
        url: media.siteUrl,
        thumbnail: {
            url: media.coverImage.medium,
        },
        description: media.description
            .replace(/(<br>)+/g, '\n\n')
            .replace(/(\n\n)+/g, '\n\n')
            .replace(/<i>/g, '*').replace(/<\/i>/g, '*'),
        fields: [
            {
                name: 'Format',
                value: AniList.mediaFormatLabels[media.format],
                inline: true
            },
            {
                name: 'Average score',
                value: `${(media.averageScore / 10).toFixed(1)} / 10`,
                inline: true
            },
            {
                name: 'Genres',
                value: media.genres.join(', ') || 'None',
                inline: true,
            }
        ]
    }, bot);
} 

function mediaSearchEmbed(
    bot: Bot,
    mediaSearchView: AniList.View<AniList.Page<AniList.Media>>
): Discord.MessageEmbed {
    const mediaList = mediaSearchView.content;
    const viewer = mediaSearchView.viewer;
    const fields = mediaList.items.map((media, i) => {
        return {
            name: `${i+1}. ${AniList.mediaDisplayTitle(media.title, viewer)}`,
            value: AniList.mediaFormatLabels[media.format] || 'No format'
        };
    });
    return new MessageEmbed({
        title: 'Search results',
        description: 'Enter the number of the content you are looking for.',
        fields: fields
    }, bot);
}