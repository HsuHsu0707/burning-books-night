# 燒書之夜

燒書之夜 demo，打開 index.html 或線上網址即可遊玩。

線上：https://hsuhsu0707.github.io/burning-books-night/

Desktop-browser reference demo of the Dounan (斗南) transitional-justice detective game. In-game text is Traditional Chinese, from 線索與湯文本 v19. The player is a detective in 2026. A pocket watch, placed on a marked spot, opens a 160° wedge of that place’s frozen moment. Q and E turn the wedge all the way around.

## Play

Open `index.html` in a desktop browser. No install and no server.

From this folder, either of these also works:

```
python3 -m http.server 8931
```

Then open http://127.0.0.1:8931

Progress is stored in the browser. The title screen can continue or start over.

## Controls

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move |
| Click empty ground | Walk there |
| F, or click a nearby person or object | Examine or collect |
| Space, on a glowing circle | Put the watch down, or pick it up |
| Q / E | Turn the past wedge a full circle |
| Tab | Record book: 地圖, 背包, 人物檔案, 劇情 |
| M | Open the map tab. Travel only in the present |
| Esc | Close the book, a note, or the letter |
| Enter | Title, then the letter, then the controls page, then the map |

Putting the watch down shows the past inside a 160° wedge. The rest of the scene stays in the present. Picking the watch up at the same spot clears the wedge.

The title screen opens the letter. The letter opens a separate controls page, then the map. Names dragged into a story blank stay in that slot. The relationship map only displays the links.

## What is in the build

Four places on one overview map: 教員宿舍與後院 (one walkable map, two watch spots), 李家, 糖廠倉庫與甘蔗田, 師母家 (present only).

Clues are T1–T20. The twenty-eight paragraphs, the letter, and the six people are in `js/content.js`.
