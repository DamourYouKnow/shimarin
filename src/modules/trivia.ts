import { decode } from 'html-entities';
import fetch from 'node-fetch';
import { Bot, Module, MessageEmbed, MessageCollector } from '../bot';

type QuestionType = 'boolean' | 'multiple';

interface Question {
    content: string,
    type: QuestionType,
    difficulty: string,
    choices: string[],
    answer: string
}

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'trivia',
            help: {
                shortDesc: 'Generate a trivia question.',
                examples: ['trivia']
            }
        }, async (message) => {
            const question = await getQuestion();
            const content = `**${question.content}**`;
            const choiceList = question.choices.map((question, i) => {
                return `**${i+1}. ${question}**`;
            }).join('\n');
            const footnote = `Trivia question data provided by `
                + `[Open Trivia DB](https://opentdb.com/).`;
            const embed = new MessageEmbed({
                title: 'Trivia question',
                description: `${content}\n\n${choiceList}\n\n${footnote}`
            }, bot);
            const post = await message.channel.send(embed);
            const collector = new MessageCollector(
                message.channel,
                message.author
            );
            collector.onReply = (reply) => {
                const choice = Number(reply.content);
                if (!isNaN(choice)) {
                    if (choice >= 1 && choice <= question.choices.length) {
                        if (question.choices[choice - 1] == question.answer) {
                            const msg = `You are correct.`
                                + ` The answer was **${question.answer}**.\n\n`
                                + footnote;
                            bot.sendEmbed(
                                reply.channel,
                                'Correct!',
                                msg
                            ).catch(console.error);
                        } else {
                            const msg = `You are incorrect. The correct answer`
                                + ` was **${question.answer}**.\n\n${footnote}`;
                            bot.sendEmbed(
                                reply.channel,
                                'Wrong!',
                                msg
                            ).catch(console.error);
                        }
                    } else {
                        bot.sendError(
                            reply.channel,
                            'Selected number is not a valid choice'
                        ).catch(console.error);
                    }
                }
            }
        });
    }
}

async function getQuestion(): Promise<Question> {
    try {
        const url = 'https://opentdb.com/api.php?amount=1&category=31';
        const response = await fetch(url, {
            timeout: 5000,
            headers:  { 'Accept': 'application/json' }
        });
        const data = (await response.json()).results[0];
        const question = {
            content: data.question,
            type: data.type,
            difficulty: data.difficulty,
            choices: shuffle([data.correct_answer, ...data.incorrect_answers]),
            answer: data.correct_answer
        } as Question;
        question.content = decode(question.content);
        question.choices = question.choices.map((choice) => decode(choice));
        question.answer = decode(question.answer);
        return question;
    } catch (err) {
        throw Error('Could not get trivia question from Open Trivia DB');
    }
}

function shuffle<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = 0; i < array.length; i++) {
        let currItem = newArray[i];
        let randIndex = random(0, newArray.length - 1);
        newArray[i] = newArray[randIndex];
        newArray[randIndex] = currItem;
    }
    return newArray;
}

function random(min: number, max: number): number {
    // min is inclusive and max is inclusive.
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

