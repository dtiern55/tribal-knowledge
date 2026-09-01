/**
 * Survivor one-liners shown on the loading screen (SlidePuzzleLoader).
 * A random one is picked per loader mount. `season` is optional — a few
 * quotes only carry a name.
 *
 * ponytail: the John Morrison "Shaman of Sexy" nickname list is deliberately
 * left out — it's ~15 lines and needs its own layout, not this one-liner block.
 */
export type Quote = { text: string; who: string; season?: string }

// The app's namesake — Sue Hawk's Borneo speech. Pulled out so the auth pages
// can show it on purpose (it's also in QUOTES for the loader's random pick).
export const SUE_HAWK_QUOTE: Quote = {
  text: 'This island is full of pretty much only two things: snakes and rats.',
  who: 'Sue Hawk',
  season: 'Season 1: Borneo',
}

export const QUOTES: Quote[] = [
  {
    text: "I really wanna get back with you guys. Except I don't fucking wanna get back with you guys at all.",
    who: 'Rick Devens',
    season: 'Season 38: Edge of Extinction',
  },
  {
    text: "So I took his hat and threw it in the fire. I don't care.",
    who: 'Sandra',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: 'I can get LOUD TOO. WHAT THE FUCK?!',
    who: 'Sandra',
    season: 'Season 7: Pearl Islands',
  },
  {
    text: "Nobody wants to date somebody that didn't make the merge!",
    who: 'Kat',
    season: 'Season 27: Blood vs. Water',
  },
  {
    text: "It's a fucking stick!",
    who: 'Eliza',
    season: 'Season 16: Micronesia',
  },
  {
    text: 'Don’t wear feathers in your hair at Tribal. Don’t tell your stories. People don’t believe your stories. They mock you. There’s no reason to tell them. And do your Tai Chi in private where nobody can see you.',
    who: 'Tyson (to Coach)',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: 'As a coconut vendor, I seek truth.',
    who: 'Vince',
    season: 'Season 30: Worlds Apart',
  },
  {
    text: 'Thanks guys. Hope you guys all get bit by a freaking crocodile. Scumbags.',
    who: 'Judd',
    season: 'Season 11: Guatemala',
  },
  {
    text: "Great. Now Andrew's naked.",
    who: 'Jeff Probst',
    season: 'Season 7: Pearl Islands',
  },
  {
    text: "Me and him got along, of course, but not in a homosexual way, that's for sure.",
    who: 'Rudy',
    season: 'Season 1: Borneo',
  },
  {
    text: "My grandmother's sitting home watching Jerry Springer right now.",
    who: 'Johnny Fairplay',
    season: 'Season 7: Pearl Islands',
  },
  {
    text: 'Do you know what a Reuben sandwich is, Jeff?',
    who: 'Christian Hubicki',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'Play with you? Oh, in the sand?',
    who: 'Christian Hubicki',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'One could say I slayed Goliath with an algorithmic slingshot.',
    who: 'Christian Hubicki',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'I got up this morning, and I had a premonition that I was going to find my shorts.',
    who: 'Philip',
    season: 'Season 22: Redemption Island',
  },
  {
    text: "Stop rapping. You're trash at rapping. You're garbage at rapping. You can't rap. You have no bars.",
    who: 'Wendell Holland',
    season: 'Season 36: Ghost Island',
  },
  {
    text: 'Natalie, is there any way I could have your jacket?',
    who: 'Angelina',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'I’m supposed to talk llama to you. BAAUGH BAUU BEBLLRAAUGHH. You understand that better?',
    who: 'Tony',
    season: 'Season 28: Cagayan',
  },
  {
    text: 'I didn’t even see what happened. I was watching Treasure Island.',
    who: 'Colby',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: "At the last challenge we sorta mouthed the words 'I love you' to one another and so that was my prize.",
    who: 'Billy',
    season: 'Season 13: Cook Islands',
  },
  {
    text: 'Well I’m wearing this… but I also put on her panties on my head.',
    who: 'Tarzan',
    season: 'Season 24: One World',
  },
  {
    text: 'I don’t want to be engaged in any sort of masculine tomfoolery with these numbskulls.',
    who: 'Cochran',
    season: 'Season 26: Caramoan',
  },
  {
    text: "To me, she's of no worth. I mean, her parents probably love her. I can't imagine her boyfriend's that cool.",
    who: 'Tyson',
    season: 'Season 18: Tocantins',
  },
  {
    text: "So I guess… Brendan or Coach is the leader? I don't know. It's, uh… I wasn't paying attention. I don't really care.",
    who: 'Tyson',
    season: 'Season 18: Tocantins',
  },
  {
    text: 'Several means seven.',
    who: 'Jelinsky',
    season: 'Season 46',
  },
  {
    text: "My favorite thing to do on Survivor is just pick a person, don't give them any heads up. Run them over with a bus, back up, run them over again.",
    who: 'Kamilla',
    season: 'Season 48',
  },
  {
    text: 'Survivor is like going on The Oregon Trail. You have to ford every river. You have to caulk every wagon. You have to go up the hills and down the hills… and sometimes you get dysentery and die.',
    who: 'Aubry',
    season: 'Season 32: Kaôh Rōng',
  },
  {
    text: "I'll be straight up, I'm leaning sandwich.",
    who: 'Austin',
    season: 'Season 45',
  },
  {
    text: "If I can't find you in Hide and Seek, I can't find you in this game.",
    who: 'Q',
    season: 'Season 46',
  },
  {
    text: "It's just immaculate, all in my mouth.",
    who: 'Woo',
    season: 'Season 28: Cagayan',
  },
  {
    text: 'Like I’m going to keep anyone warm? I weigh 7 pounds… get off of me.',
    who: 'Courtney Yates',
    season: 'Season 15: China',
  },
  {
    text: "I am voting for you because when you snore at nighttime it sounds like someone's choking a walrus.",
    who: 'Courtney Yates',
    season: 'Season 15: China',
  },
  {
    text: 'I dislike everyone else more than I dislike Todd and Amanda. And I think they mistake that for friendship.',
    who: 'Courtney Yates',
    season: 'Season 15: China',
  },
  {
    text: "At least our guys know they're useless. Except for Coach. He seems to think he's amazing… don't know where he got that idea.",
    who: 'Courtney Yates',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: "I smoked three packs of cigarettes a day for 20 years, and I haven't had a cigarette in like… 31 hours.",
    who: 'Shane (day 1)',
    season: 'Season 12: Exile Island',
  },
  {
    text: "I will. I'll drive up and I'll kill you in your shitty little apartment, and then I'll drive to my club and that will be it.",
    who: 'Shane',
    season: 'Season 12: Exile Island',
  },
  {
    text: 'I’ve been through a hurricane, I’ve been attacked by a shark, had a run-in with a crocodile, got captured by the Indian tribe, I mean, they were some very defining moments of my life.',
    who: 'Coach Benjamin Wade',
    season: 'Season 18: Tocantins',
  },
  {
    text: "We're like chicken parm and tuna fish. It just don't taste good.",
    who: 'Rodney',
    season: 'Season 30: Worlds Apart',
  },
  {
    text: 'I am your friend, but if you fuck with me, you’re dead.',
    who: 'Abi-Maria',
    season: 'Season 25: Philippines',
  },
  {
    text: "I don't need no clues. I find 'em anyway.",
    who: 'Russell Hantz',
    season: 'Season 19: Samoa',
  },
  SUE_HAWK_QUOTE,
  {
    text: 'No, Robb, you were not in the attack zone when you grabbed Clay by the throat.',
    who: 'Jeff Probst',
    season: 'Season 5: Thailand',
  },
  {
    text: "A kiss is nice. Maybe if it was love, he'd have given you the Immunity Necklace.",
    who: 'Jeff Probst',
    season: 'Season 13: Cook Islands',
  },
  {
    text: 'Wh- what… Are you saying people are lying?',
    who: 'Mike White',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'Bitch.',
    who: 'Mike White (to a branch)',
    season: 'Season 37: David vs. Goliath',
  },
  {
    text: 'Tomorrow we make our apologies, tonight we make our move.',
    who: 'Tom Westman',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: 'I don’t know how I necessarily became the junior deputy firewood bitch.',
    who: 'Rob Cesternino',
    season: 'Season 6: The Amazon',
  },
  {
    text: "You know how some people forgive but don't forget? Well, I don't forgive and I don't forget.",
    who: 'Sandra',
    season: 'Season 20: Heroes vs. Villains',
  },
  {
    text: 'I’m a gangster in an Oprah suit.',
    who: 'Cirie',
    season: 'Season 20: Heroes vs. Villains',
  },
]
