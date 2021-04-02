import fetch from 'node-fetch';
import { GraphAPI } from './graphql';
import * as Data from './data';

export const redirectUri = 'https://anilist.co/api/v2/oauth/pin';
export const oauthUrl = 'https://anilist.co/api/v2/oauth/authorize';

export interface User {
    id: number,
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
}

export interface Viewer extends User {
    options: {
        titleLanguage: TitleLanguage,
        displayAdultContent: boolean,
        profileColor: string
    }
}

// TODO: Move this outside of the AniList module.
export interface View<ViewType> {
    content: ViewType,
    viewer?: Viewer
}

export interface MediaList {
    type: MediaType,
    status: MediaListStatus
    entries: MediaListItem[]
}

export interface MediaListFilter {
    type: MediaType,
    status: MediaListStatus
}

export interface MediaListItem {
    media: Media,
    progress: number | null;
}

export interface Media {
    id: number,
    type: MediaType,
    format: MediaFormat,
    title: MediaTitle,
    description: string,
    coverImage: {
        medium: string
    },
    chapters: number | null,
    episodes: number | null,
    genres: string[],
    tags: MediaTag[],
    averageScore: number,
    siteUrl: string,
    isAdult: boolean
}

export interface MediaTitle {
    english: string | null,
    romaji: string | null,
    native: string | null
}

export interface MediaTag {
    name: string
}

export interface Notification {
    media: Media,
    episode: number,
    createdAt: number
}

export interface Page<ContentType> {
    items: ContentType[],
    info: PageInfo
}

export interface PageInfo {
    total: number,
    perPage: number,
    currentPage: number,
    lastPage: number,
    hasNextPage: boolean
}

export type MediaType = 'ANIME' | 'MANGA';

export type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED'
    | 'PAUSED' | 'REPEATING';

export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA'
    | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

export const mediaFormatLabels: {[format in MediaFormat]: string} = {
    'TV': 'TV',
    'TV_SHORT': 'TV Short',
    'MOVIE': 'Movie',
    'SPECIAL': 'Special',
    'OVA': 'OVA',
    'ONA': 'ONA',
    'MUSIC': 'Music',
    'MANGA': 'Manga',
    'NOVEL': 'Novel',
    'ONE_SHOT': 'One-shot'
};

export type TitleLanguage = 'ENGLISH' | 'ROMAJI' | 'NATIVE';

const mediaFields = `
id
type
format
title {
    english
    romaji
    native
}
description(asHtml: false)
coverImage {
    medium
}
episodes
chapters
genres
tags {
    name
}
averageScore
siteUrl
isAdult
`;

const api = new GraphAPI('https://graphql.anilist.co');

export async function getToken(
    apiClientId: number,
    apiClientSecret: string, 
    authCode: string
): Promise<string | null> {
    const response = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        timeout: 5000,
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: apiClientId,
            client_secret: apiClientSecret,
            redirect_uri: redirectUri,
            code: authCode
        })
    });
    if (!response.ok) return null;
    return (await response.json()).access_token;
}

export async function getViewerFromToken(
    token: string
): Promise<Viewer | null> {
    const response = await api.query(
        `
        {
            Viewer {
                id
                name
                options {
                    titleLanguage
                    displayAdultContent
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        {}, token
    );
    if (!response.data) return null;
    return response.data?.Viewer as Viewer;
}

export async function getViewer(discordId: string): Promise<Viewer | null> {
    try {
        const connection = await Data.getAccountConnection(discordId);
        if (!connection) return null;
    return await getViewerFromToken(connection.token);
    } catch {
        return null;
    }
}

export async function searchUser(
    username: string
): Promise<User | null> {
    if (!username) return null;
    const response = await api.query(
        `query ($username: String) {    
            User(name: $username) {
                id
                name
                options {
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        {
            username: username
        }
    );
    if (response.errors && response.errors.some((e) => e.status == 404)) {
        return null;
    }
    return response.data.User as User;
}

interface MediaSearchFilter {
    type: MediaType
}

export async function getMediaSearchPage(
    search: string,
    filter: MediaSearchFilter,
    page: number,
    viewer?: Viewer
): Promise<View<Page<Media>>> {
    const typeQuery = filter.type ? '$type: MediaType,' : '';
    const typeParam = filter.type ? ', type: $type' : '';
    const response = await api.query(
        `query (
            $search: String,
            ${typeQuery}
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                media (search: $search${typeParam}) {
                    ${mediaFields}
                }
            }
        }`,
        {
            search: search,
            ...(filter.type ? {type: filter.type} : {}),
            page: page,
            perPage: 10
        }
    );
    const results = response.data.Page?.media;
    return {
        content: {
            items: results as Media[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
}

export async function getMediaListPage(
    userId: number,
    filter: MediaListFilter,
    page: number,
    viewer?: Viewer
): Promise<View<Page<MediaListItem>> | null> {
    const response = await api.query(
        `query (
            $userId: Int,
            $type: MediaType,
            $status: MediaListStatus,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                mediaList (
                    userId: $userId,
                    type: $type,
                    status: $status,
                    sort: [UPDATED_TIME_DESC]
                ) {
                    media {
                        ${mediaFields}
                    }
                    progress
                }
            }
        }`,
        {
            userId: userId,
            type: filter.type,
            status: filter.status,
            page: page,
            perPage: 6
        }
    );
    const results = response.data.Page?.mediaList;
    if (!results) return null;
    return {
        content: {
            items: results as MediaListItem[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
}

export async function getNotifiations(
    token: string,
    page: number,
): Promise<View<Page<Notification>> | null> {
    const response = await api.query(
        `query (
            $type: NotificationType,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                notifications (
                    type: $type,
                ) {
                    ... on AiringNotification {
                        media {
                            title {
                                english
                                romaji
                                native
                            }
                        }
                        createdAt
                        episode
                    }
                }
            }
        }`,
        {
            type: 'AIRING',
            page: page,
            perPage: 10
        },
        token
    );
    const results = response.data.Page?.notifications;
    if (!results) return null;
    return {
        content: {
            items: results as Notification[],
            info: response.data.Page.pageInfo as PageInfo
        },
        
    };
}

export function mediaDisplayTitle(title: MediaTitle, viewer?: Viewer): string {
    const titleOrders: {[lang in TitleLanguage]: string[]} = {
        'ENGLISH': [title.english, title.romaji, title.native],
        'ROMAJI': [title.romaji, title.english, title.native],
        'NATIVE': [title.native, title.romaji, title.english]
    };
    const titleOrder = viewer ?
            titleOrders[viewer.options.titleLanguage] : titleOrders['ENGLISH'];
    return titleOrder.find((title) => title != null) || 'No title';
}