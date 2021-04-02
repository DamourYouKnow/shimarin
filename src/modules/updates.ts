import * as Data from '../data';
import { Bot, Module, MessageEmbed } from '../bot';
import * as AniList from '../anilist';

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'updates',
            help: {
                shortDesc: 'Get updates for airing anime you follow.',
                longDesc: 'Requires AniList account connection.',
                examples: ['updates']
            }
        }, async (message) => {
            const viewer = await AniList.getViewer(message.author.id);
            if (!viewer) {
                await bot.sendError(
                    message.channel,
                    'You must connect your AniList account to use this command.'
                );
                return;
            }
            const user = await Data.getAccountConnection(message.author.id);
            const notificationsView = await AniList.getNotifiations(
                user.token,
                0
            );
            const embed = await updatesEmbed(bot, notificationsView);
            await message.channel.send(embed);
        });
    }
}

function updatesEmbed(
    bot: Bot,
    notificationsView: AniList.View<AniList.Page<AniList.Notification>>
) {
    const viewer = notificationsView.viewer;
    const fields = notificationsView.content.items.map((notification) => {
        const date = new Date(notification.createdAt * 1000);
        return {
            name: AniList.mediaDisplayTitle(notification.media.title, viewer),
            value: `Episode ${notification.episode} aired ${timeAgo(date)}`
        };
    });

    return new MessageEmbed({
        title: 'Your anime updates',
        fields: fields
    }, bot);
}

function timeAgo(date: Date): string {
    const now = new Date();
    const delta = Math.floor(now.getTime() - date.getTime());
    const seconds = Math.floor(delta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    const createStr = (value: number, label: string): string => {
        if (value == 1) return `${value} ${label} ago`;
        return `${value} ${label}s ago`;
    };

    if (months > 0) return createStr(months, 'month');
    if (weeks > 0) return createStr(weeks, 'week');
    if (days > 0) return createStr(days, 'day');
    if (hours > 0) return createStr(hours, 'hour');
    if (minutes > 0) return createStr(minutes, 'minute');
    return createStr(seconds, 'second');
} 


