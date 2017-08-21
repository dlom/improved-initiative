import express = require("express");

import bodyParser = require("body-parser");
import mustacheExpress = require("mustache-express");
import session = require("express-session");
import request = require("request");

import { Library, StatBlock, Spell } from "./library";

interface PatreonPostAttributes {
    title: string;
    content: string;
    url: string;
    created_at: string;
    was_posted_by_campaign_owner: boolean;
}

interface PatreonPost {
    attributes: PatreonPostAttributes;
    id: string;
    type: string;
}

const pageRenderOptions = (encounterId: string) => ({
    rootDirectory: "../../",
    encounterId,
    appInsightsKey: process.env.APPINSIGHTS_INSTRUMENTATIONKEY || "",
    postedEncounter: null,
});

const probablyUniqueString = (): string => {
    const chars = "1234567890abcdefghijkmnpqrstuvxyz";
    let str = "";
    for (let i = 0; i < 8; i++) {
        const index = Math.floor(Math.random() * chars.length);
        str += chars[index];
    }

    return str;
};

const initializeNewPlayerView = (playerViews) => {
    const encounterId = probablyUniqueString();
    playerViews[encounterId] = {};
    return encounterId;
};

export default function (app: express.Express, statBlockLibrary: Library<StatBlock>, spellLibrary: Library<Spell>, playerViews) {
    let mustacheEngine = mustacheExpress();
    if (process.env.NODE_ENV === "development") {
        mustacheEngine.cache._max = 0;
    }
    app.engine("html", mustacheEngine);
    app.set("view engine", "html");
    app.set("views", __dirname + "/../html");

    app.use(express.static(__dirname + "/../public"));
    app.use(session({
        secret: process.env.SESSION_SECRET || probablyUniqueString(),
    }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded());

    app.get("/", (req, res) => {
        res.render("landing", pageRenderOptions(initializeNewPlayerView(playerViews)));
    });

    app.get("/e/:id", (req, res) => {
        const session: any = req.session;
        const options = pageRenderOptions(req.params.id);
        if (session.postedEncounter) {
            options.postedEncounter = JSON.stringify(session.postedEncounter);
            delete session.postedEncounter;
        }
        res.render("tracker", options);
    });

    app.get("/p/:id", (req, res) => {
        res.render("playerview", pageRenderOptions(req.params.id));
    });

    app.get("/playerviews/:id", (req, res) => {
        res.json(playerViews[req.params.id]);
    });

    app.get("/templates/:name", (req, res) => {
        res.render(`templates/${req.params.name}`, {
            rootDirectory: "..",
        });
    });

    app.get(statBlockLibrary.Route(), (req, res) => {
        res.json(statBlockLibrary.GetListings());
    });

    app.get(statBlockLibrary.Route() + ":id", (req, res) => {
        res.json(statBlockLibrary.GetById(req.params.id));
    });

    app.get(spellLibrary.Route(), (req, res) => {
        res.json(spellLibrary.GetListings());
    });

    app.get(spellLibrary.Route() + ":id", (req, res) => {
        res.json(spellLibrary.GetById(req.params.id));
    });

    const importEncounter = (req, res) => {
        const viewId = (req.params.id != null) ? req.params.id : initializeNewPlayerView(playerViews);
        const session: any = req.session;

        const payload = (req.method === "POST" ? req.body : req.query);

        if (typeof payload.Combatants === "string") {
            session.postedEncounter = { Combatants: JSON.parse(payload.Combatants) };
        } else {
            session.postedEncounter = payload;
        }

        res.redirect("/e/" + viewId);
    };

    app.post("/launchencounter/:id?", importEncounter);
    app.post("/importencounter/:id?", importEncounter);
    app.get("/launchencounter/:id?", importEncounter);
    app.get("/importencounter/:id?", importEncounter);

    app.post("/createencounter/", (req, res) => {
        const newViewId = initializeNewPlayerView(playerViews);
        res.json({"encounterId": newViewId});
    })

    const url = process.env.PATREON_URL;
    if (url) {
        request.get(url,
            (error, response, body) => {
                const json: { data: PatreonPost[] } = JSON.parse(body);
                if (json.data) {
                    const latestPost = json.data.filter(d => d.attributes.was_posted_by_campaign_owner)[0];
                    app.get("/whatsnew/", (req, res) => {
                        res.json(latestPost);
                    });
                }
            });
    }
}
