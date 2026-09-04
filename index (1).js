const {
    Client,
    GatewayIntentBits,
    Events,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionsBitField
} = require("discord.js");


// ============================================================
// KONFIGURATION
// ============================================================

const TOKEN = "";
const GUILD_ID = "1544691720166314014";

const ROLE_NEWMEMBER= "New Member";
const ROLE_MEMBER= "Member";
const ROLE_STAFF = "Staff-Team";
const ROLE_OWNER = "Owner";
const ROLE_INHABER = "Founder";
const ROLE_MODERATOR = "Moderator";
const ROLE_RANK = "Rank Beauftragter";

const ROLE_UNVERIFIED = "unverify";
const ROLE_VERIFIED = "verify";

const CHANNEL_LOGS = "discord-logs";
const CHANNEL_WELCOME = "📌・welcome";
const CHANNEL_RULES = "📜・rules";
const CHANNEL_ANNOUNCEMENT = "📢・announcements";
const CHANNEL_VERIFY = "verify";

const TICKET_CATEGORY = "Ticket";



// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});


// ============================================================
// DATEN
// ============================================================

let maintenance = false;

const warnings = new Map();

const tickets = new Map();


// ============================================================
// HILFSFUNKTIONEN
// ============================================================

function getRole(guild, name) {
    return guild.roles.cache.find(
        role => role.name.toLowerCase() === name.toLowerCase()
    );
}

function getChannel(guild, name) {
    return guild.channels.cache.find(
        channel => channel.name.toLowerCase() === name.toLowerCase()
    );
}

function isStaff(member) {
    return member.roles.cache.some(
        role => role.name.toLowerCase() === ROLE_STAFF.toLowerCase()
    );
}

function isOwner(member) {
    return member.roles.cache.some(
        role =>
            role.name.toLowerCase() === ROLE_OWNER.toLowerCase() ||
            role.name.toLowerCase() === ROLE_INHABER.toLowerCase()
    );
}

function isRankStaff(member) {
    return (
        isOwner(member) ||
        member.roles.cache.some(
            role => role.name.toLowerCase() === ROLE_RANK.toLowerCase()
        )
    );
}

async function logAction(guild, title, description) {

    const channel = getChannel(guild, CHANNEL_LOGS);

    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
}


async function getOrCreateChannel(guild, name, type = ChannelType.GuildText) {

    let channel = getChannel(guild, name);

    if (channel) return channel;

    channel = await guild.channels.create({
        name,
        type
    });

    return channel;
}


// ============================================================
// TRANSLATOR
// ============================================================

async function translateText(text, targetLanguage) {

    try {

        const url =
            "https://translate.googleapis.com/translate_a/single" +
            `?client=gtx&sl=auto&tl=${encodeURIComponent(targetLanguage)}` +
            `&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Translation API error");
        }

        const data = await response.json();

        if (!data[0]) {
            return null;
        }

        return data[0]
            .map(part => part[0])
            .filter(Boolean)
            .join("");

    } catch (error) {

        console.error("Übersetzungsfehler:", error);

        return null;
    }
}


// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

    // --------------------------------------------------------
    // MAINTENANCE
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("maintenance")
        .setDescription("Wartungsmodus / Maintenance mode")
        .addBooleanOption(option =>
            option
                .setName("status")
                .setDescription("An oder Aus / On or Off")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // RESTART
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Startet den Bot neu / Restart bot"),

    // --------------------------------------------------------
    // BAN
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Bannt einen Benutzer / Ban a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer / User")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund / Reason")
        ),

    // --------------------------------------------------------
    // KICK
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kickt einen Benutzer / Kick a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer / User")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund / Reason")
        ),

    // --------------------------------------------------------
    // TIMEOUT
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout für einen Benutzer / Timeout a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer / User")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("dauer")
                .setDescription("Dauer in Minuten / Duration in minutes")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(60)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund / Reason")
        ),

    // --------------------------------------------------------
    // WARN
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Verwarnt einen Benutzer / Warn a user")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer / User")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund / Reason")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // TICKET
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Ticket-System / Ticket system")
        .addSubcommand(sub =>
            sub
                .setName("add")
                .setDescription("Benutzer zum Ticket hinzufügen / Add user")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Benutzer / User")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("close")
                .setDescription("Ticket schließen / Close ticket")
        )
        .addSubcommand(sub =>
            sub
                .setName("takeover")
                .setDescription("Ticket übernehmen / Take over ticket")
        ),

    // --------------------------------------------------------
    // TICKET PANEL
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("ticketpanel")
        .setDescription("Ticket-Auswahl senden / Send ticket panel"),

    // --------------------------------------------------------
    // VERIFY
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("verifypanel")
        .setDescription("Verify-Panel senden / Send verify panel"),

    // --------------------------------------------------------
    // ANNOUNCEMENT
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("announcement")
        .setDescription("Ankündigung erstellen / Create announcement")
        .addStringOption(option =>
            option
                .setName("titel")
                .setDescription("Titel / Title")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("nachricht")
                .setDescription("Nachricht / Message")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("ping")
                .setDescription("Staff-Team und Owner/Inhaber pingen"),
        )
        .addChannelOption(option =>
            option
                .setName("kanal")
                .setDescription("Zielkanal / Target channel")
                .addChannelTypes(ChannelType.GuildText)
        ),

    // --------------------------------------------------------
    // TRANSLATE
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("translate")
        .setDescription("Übersetzt eine Nachricht / Translate a message")
        .addStringOption(option =>
            option
                .setName("sprache")
                .setDescription("Zielsprache / Target language")
                .setRequired(true)
                .addChoices(
                    { name: "English", value: "en" },
                    { name: "Deutsch", value: "de" },
                    { name: "Français", value: "fr" },
                    { name: "Español", value: "es" },
                    { name: "Italiano", value: "it" },
                    { name: "Nederlands", value: "nl" },
                    { name: "Polski", value: "pl" },
                    { name: "Türkçe", value: "tr" },
                    { name: "Português", value: "pt" },
                    { name: "Русский", value: "ru" }
                )
        )
        .addStringOption(option =>
            option
                .setName("nachricht")
                .setDescription("Text / Text")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // HELP
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Zeigt die verfügbaren Befehle / Show commands"),

    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Rolle vergeben oder entfernen / Manage rank")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer / User")
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("rolle")
                .setDescription("Rolle / Role")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("aktion")
                .setDescription("Geben oder nehmen / Add or remove")
                .setRequired(true)
                .addChoices(
                    { name: "Geben / Add", value: "add" },
                    { name: "Nehmen / Remove", value: "remove" }
                )
        ),

    // --------------------------------------------------------
    // LOCK
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("sperre")
        .setDescription("Sperrt oder entsperrt einen Kanal / Lock or unlock")
        .addStringOption(option =>
            option
                .setName("aktion")
                .setDescription("Sperren oder öffnen / Lock or unlock")
                .setRequired(true)
                .addChoices(
                    { name: "Sperren / Lock", value: "lock" },
                    { name: "Öffnen / Unlock", value: "unlock" }
                )
        )
        .addStringOption(option =>
            option
                .setName("typ")
                .setDescription("Text oder Voice / Text or Voice")
                .setRequired(true)
                .addChoices(
                    { name: "Text", value: "text" },
                    { name: "Voice", value: "voice" }
                )
        )
        .addChannelOption(option =>
            option
                .setName("kanal")
                .setDescription("Kanal / Channel")
        )

].map(command => command.toJSON());


// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, async () => {

    console.log(`Bot ist online als ${client.user.tag}`);

    try {

        await client.application.commands.set(
            commands,
            GUILD_ID
        );

        console.log("Alle Slash-Commands wurden registriert.");

    } catch (error) {

        console.error(
            "Fehler beim Registrieren der Slash-Commands:",
            error
        );
    }

    // Ticket-Watcher starten
    startTicketWatcher();
});


// ============================================================
// WELCOME
// ============================================================

client.on(Events.GuildMemberAdd, async member => {

    const channel = getChannel(
        member.guild,
        CHANNEL_WELCOME
    );

    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle("Willkommen / Welcome")
        .setDescription(
            `Willkommen ${member} auf dem Server!\n\n` +
            `Welcome ${member} to the server!\n\n` +
            `Bitte verifiziere dich im Verify-Kanal.\n` +
            `Please verify yourself in the Verify channel.`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    await channel.send({
        content: `${member}`,
        embeds: [embed]
    }).catch(() => {});
});


// ============================================================
// INTERACTIONS
// ============================================================

client.on(Events.InteractionCreate, async interaction => {

    // ========================================================
    // BUTTONS
    // ========================================================

    if (interaction.isButton()) {

        // ----------------------------------------------------
        // VERIFY
        // ----------------------------------------------------

        if (interaction.customId === "verify_button") {

            const unverified = getRole(
                interaction.guild,
                ROLE_UNVERIFIED
            );

            const verified = getRole(
                interaction.guild,
                ROLE_VERIFIED
            );

            if (!verified) {
                return interaction.reply({
                    content: "Die Rolle `verifiziert` wurde nicht gefunden.",
                    ephemeral: true
                });
            }

            try {

                if (unverified) {
                    await interaction.member.roles.remove(
                        unverified
                    );
                }

                await interaction.member.roles.add(
                    verified
                );

                await logAction(
                    interaction.guild,
                    "Verify",
                    `${interaction.user} wurde verifiziert.`
                );

                return interaction.reply({
                    content:
                        "Du bist jetzt verifiziert! / You are now verified!",
                    ephemeral: true
                });

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "Verifizierung fehlgeschlagen.",
                    ephemeral: true
                });
            }
        }


        // ----------------------------------------------------
        // TICKET BUTTONS
        // ----------------------------------------------------

        if (interaction.customId.startsWith("ticket_")) {

            const type =
                interaction.customId.replace(
                    "ticket_",
                    ""
                );

            const ticketNames = {
                kauf: {
                    de: "Kauf Ticket",
                    en: "Purchase Ticket"
                },
                staff: {
                    de: "Staff Bewerbung",
                    en: "Staff Application"
                },
                hilfe: {
                    de: "Allgemeine Hilfe",
                    en: "General Help"
                },
                partner: {
                    de: "Partnerschafts Ticket",
                    en: "Partnership Ticket"
                }
            };

            const ticketInfo = ticketNames[type];

            if (!ticketInfo) return;

            let category = interaction.guild.channels.cache.find(
                channel =>
                    channel.type === ChannelType.GuildCategory &&
                    channel.name.toLowerCase() ===
                    TICKET_CATEGORY.toLowerCase()
            );

            if (!category) {

                category =
                    await interaction.guild.channels.create({
                        name: TICKET_CATEGORY,
                        type: ChannelType.GuildCategory
                    });
            }

            const existingTicket =
                interaction.guild.channels.cache.find(
                    channel =>
                        channel.parentId === category.id &&
                        channel.topic &&
                        channel.topic.includes(
                            `ticketOwner:${interaction.user.id}`
                        )
                );

            if (existingTicket) {

                return interaction.reply({
                    content:
                        `Du hast bereits ein Ticket: ${existingTicket}`,
                    ephemeral: true
                });
            }

            const staffRole =
                getRole(
                    interaction.guild,
                    ROLE_STAFF
                );

            const ownerRole =
                getRole(
                    interaction.guild,
                    ROLE_OWNER
                );

            const inhaberRole =
                getRole(
                    interaction.guild,
                    ROLE_INHABER
                );

            const permissionOverwrites = [
                {
                    id: interaction.guild.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ];

            if (staffRole) {

                permissionOverwrites.push({
                    id: staffRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });
            }

            if (ownerRole) {

                permissionOverwrites.push({
                    id: ownerRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });
            }

            if (inhaberRole) {

                permissionOverwrites.push({
                    id: inhaberRole.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });
            }

            const channel =
                await interaction.guild.channels.create({
                    name:
                        `ticket-${interaction.user.username}`
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                            .slice(0, 90),

                    type: ChannelType.GuildText,

                    parent: category.id,

                    topic:
                        `ticketOwner:${interaction.user.id};type:${type};lastActivity:${Date.now()}`,

                    permissionOverwrites
                });

            tickets.set(channel.id, {
                ownerId: interaction.user.id,
                type,
                lastActivity: Date.now(),
                warned: false,
                takenBy: null
            });

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        `${ticketInfo.de} / ${ticketInfo.en}`
                    )
                    .setDescription(
                        `Hallo ${interaction.user}!\n\n` +
                        `Willkommen in deinem Ticket.\n` +
                        `Welcome to your ticket.\n\n` +

                        `Ein Staff-Mitglied wird sich so schnell wie möglich darum kümmern.\n` +
                        `A staff member will help you as soon as possible.\n\n` +

                        `**Ticket commands:**\n` +
                        `/ticket add\n` +
                        `/ticket takeover\n` +
                        `/ticket close\n\n` +

                        `Wenn 24 Stunden lang keine Aktivität stattfindet, wirst du erinnert.\n` +
                        `After 24 hours without activity, you will receive a reminder.\n\n` +

                        `Nach 48 Stunden ohne Aktivität wird das Ticket automatisch geschlossen.\n` +
                        `After 48 hours without activity, the ticket will automatically close.`
                    )
                    .setTimestamp();

            let ping = `${interaction.user}`;

            if (staffRole) {
                ping += ` ${staffRole}`;
            }
            if (memberRole) {
                ping += ` ${memberRole}`;
            }
            if (ownerRole) {
                ping += ` ${ownerRole}`;
            }

            if (inhaberRole) {
                ping += ` ${inhaberRole}`;
            }

            await channel.send({
                content: ping,
                embeds: [embed]
            });

            await interaction.reply({
                content:
                    `Ticket erstellt / Ticket created: ${channel}`,
                ephemeral: true
            });

            await logAction(
                interaction.guild,
                "Ticket erstellt / Ticket created",
                `${interaction.user} erstellte ${channel}.`
            );

            return;
        }
    }


    // ========================================================
    // CHAT INPUT
    // ========================================================

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;


    // ========================================================
    // MAINTENANCE
    // ========================================================

    if (command === "maintenance") {

        if (!isOwner(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Owner oder Inhaber dürfen den Wartungsmodus ändern.",
                ephemeral: true
            });
        }

        maintenance =
            interaction.options.getBoolean("status");

        return interaction.reply(
            maintenance
                ? "Wartungsmodus ist jetzt AN."
                : "Wartungsmodus ist jetzt AUS."
        );
    }


    // ========================================================
    // RESTART
    // ========================================================

    if (command === "restart") {

        if (!isOwner(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Owner oder Inhaber dürfen den Bot neustarten.",
                ephemeral: true
            });
        }

        await interaction.reply(
            "Bot wird neu gestartet..."
        );

        process.exit(0);
    }


    // ========================================================
    // MAINTENANCE BLOCK
    // ========================================================

    if (
        maintenance &&
        command !== "maintenance" &&
        command !== "restart"
    ) {

        return interaction.reply({
            content:
                "Der Bot befindet sich gerade im Wartungsmodus.",
            ephemeral: true
        });
    }


    // ========================================================
    // BAN
    // ========================================================

    if (command === "ban") {

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.BanMembers
            )
        ) {
            return interaction.reply({
                content:
                    "Du brauchst `Mitglieder bannen`.",
                ephemeral: true
            });
        }

        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("grund") ||
            "Kein Grund angegeben.";

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member || !member.bannable) {

            return interaction.reply({
                content:
                    "Ich kann diesen Benutzer nicht bannen.",
                ephemeral: true
            });
        }

        await member.ban({
            reason
        });

        await interaction.reply(
            `🔨 ${user.tag} wurde gebannt.\nGrund: ${reason}`
        );

        await logAction(
            interaction.guild,
            "Ban",
            `${user.tag} wurde von ${interaction.user.tag} gebannt.\nGrund: ${reason}`
        );

        return;
    }


    // ========================================================
    // KICK
    // ========================================================

    if (command === "kick") {

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.KickMembers
            )
        ) {
            return interaction.reply({
                content:
                    "Du brauchst `Mitglieder kicken`.",
                ephemeral: true
            });
        }

        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("grund") ||
            "Kein Grund angegeben.";

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member || !member.kickable) {

            return interaction.reply({
                content:
                    "Ich kann diesen Benutzer nicht kicken.",
                ephemeral: true
            });
        }

        await member.kick(reason);

        await interaction.reply(
            `👢 ${user.tag} wurde gekickt.\nGrund: ${reason}`
        );

        await logAction(
            interaction.guild,
            "Kick",
            `${user.tag} wurde von ${interaction.user.tag} gekickt.\nGrund: ${reason}`
        );

        return;
    }


    // ========================================================
    // TIMEOUT
    // ========================================================

    if (command === "timeout") {

        if (
            !interaction.memberPermissions.has(
                PermissionFlagsBits.ModerateMembers
            )
        ) {
            return interaction.reply({
                content:
                    "Du brauchst `Mitglieder moderieren`.",
                ephemeral: true
            });
        }

        const user =
            interaction.options.getUser("user");

        const duration =
            interaction.options.getInteger("dauer");

        const reason =
            interaction.options.getString("grund") ||
            "Kein Grund angegeben.";

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member || !member.moderatable) {

            return interaction.reply({
                content:
                    "Ich kann diesem Benutzer keinen Timeout geben.",
                ephemeral: true
            });
        }

        await member.timeout(
            duration * 60 * 1000,
            reason
        );

        await interaction.reply(
            `⏱️ ${user.tag} hat einen Timeout von ${duration} Minuten bekommen.\nGrund: ${reason}`
        );

        await logAction(
            interaction.guild,
            "Timeout",
            `${user.tag} wurde von ${interaction.user.tag} für ${duration} Minuten getimeoutet.\nGrund: ${reason}`
        );

        return;
    }


    // ========================================================
    // WARN
    // ========================================================

    if (command === "warn") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Staff-Team darf Verwarnungen vergeben.",
                ephemeral: true
            });
        }

        const user =
            interaction.options.getUser("user");

        const reason =
            interaction.options.getString("grund");

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "Benutzer nicht gefunden.",
                ephemeral: true
            });
        }

        const current =
            (warnings.get(user.id) || 0) + 1;

        warnings.set(user.id, current);

        let punishment = "Keine weitere Strafe.";

        if (current === 3) {

            await member.timeout(
                5 * 60 * 1000,
                "3 Warnungen"
            );

            punishment =
                "5 Minuten Timeout.";

        } else if (current === 6) {

            await member.timeout(
                10 * 60 * 1000,
                "6 Warnungen"
            );

            punishment =
                "10 Minuten Timeout.";

        } else if (current === 9) {

            await member.timeout(
                15 * 60 * 1000,
                "9 Warnungen"
            );

            punishment =
                "15 Minuten Timeout.";

        } else if (current === 12) {

            await member.timeout(
                20 * 60 * 1000,
                "12 Warnungen"
            );

            punishment =
                "20 Minuten Timeout.";

        } else if (current === 15) {

            await member.timeout(
                25 * 60 * 1000,
                "15 Warnungen"
            );

            punishment =
                "25 Minuten Timeout.";

        } else if (current === 18) {

            await member.timeout(
                30 * 60 * 1000,
                "18 Warnungen"
            );

            punishment =
                "30 Minuten Timeout.";

        } else if (current === 21) {

            await member.timeout(
                45 * 60 * 1000,
                "21 Warnungen"
            );

            punishment =
                "45 Minuten Timeout.";

        } else if (current === 24) {

            await member.timeout(
                60 * 60 * 1000,
                "24 Warnungen"
            );

            punishment =
                "60 Minuten Timeout.";

        } else if (current >= 27) {

            await member.kick(
                "Warnsystem: maximale Warnstufe erreicht"
            );

            punishment =
                "Kick.";

            warnings.set(user.id, 0);
        }

        await user.send(
            `Du wurdest auf ${interaction.guild.name} verwarnt.\n\n` +
            `Grund: ${reason}\n` +
            `Warnungen: ${current}\n` +
            `Maßnahme: ${punishment}\n\n` +
            `You received a warning on ${interaction.guild.name}.\n` +
            `Reason: ${reason}`
        ).catch(() => {});

        await interaction.reply(
            `⚠️ ${user.tag} wurde verwarnt.\n` +
            `Warnungen: ${current}\n` +
            `Maßnahme: ${punishment}`
        );

        await logAction(
            interaction.guild,
            "Warn",
            `${user.tag} wurde von ${interaction.user.tag} verwarnt.\n` +
            `Warnungen: ${current}\n` +
            `Grund: ${reason}\n` +
            `Maßnahme: ${punishment}`
        );

        return;
    }


    // ========================================================
    // TICKET
    // ========================================================

    if (command === "ticket") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Staff-Team darf diese Ticket-Befehle benutzen.",
                ephemeral: true
            });
        }

        const subcommand =
            interaction.options.getSubcommand();

        const channel = interaction.channel;

        if (
            !channel.parent ||
            channel.parent.name.toLowerCase() !==
            TICKET_CATEGORY.toLowerCase()
        ) {

            return interaction.reply({
                content:
                    "Dieser Befehl funktioniert nur in einem Ticket.",
                ephemeral: true
            });
        }


        // ----------------------------------------------------
        // ADD
        // ----------------------------------------------------

        if (subcommand === "add") {

            const user =
                interaction.options.getUser("user");

            await channel.permissionOverwrites.edit(
                user.id,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            await channel.send(
                `${user} wurde zum Ticket hinzugefügt.\n` +
                `${user} was added to the ticket.`
            );

            await interaction.reply({
                content:
                    "Benutzer wurde hinzugefügt.",
                ephemeral: true
            });

            await logAction(
                interaction.guild,
                "Ticket Add",
                `${user.tag} wurde von ${interaction.user.tag} zu ${channel.name} hinzugefügt.`
            );

            return;
        }


        // ----------------------------------------------------
        // TAKEOVER
        // ----------------------------------------------------

        if (subcommand === "takeover") {

            const data =
                tickets.get(channel.id);

            if (data) {

                data.takenBy =
                    interaction.user.id;

                data.lastActivity =
                    Date.now();
            }

            await channel.send(
                `🎫 ${interaction.user} hat dieses Ticket übernommen.\n` +
                `🎫 ${interaction.user} has taken over this ticket.`
            );

            await interaction.reply({
                content:
                    "Ticket übernommen.",
                ephemeral: true
            });

            await logAction(
                interaction.guild,
                "Ticket übernommen",
                `${interaction.user.tag} hat ${channel.name} übernommen.`
            );

            return;
        }


        // ----------------------------------------------------
        // CLOSE
        // ----------------------------------------------------

        if (subcommand === "close") {

            await interaction.reply(
                "Ticket wird geschlossen / Ticket is closing..."
            );

            await logAction(
                interaction.guild,
                "Ticket geschlossen",
                `${channel.name} wurde von ${interaction.user.tag} geschlossen.`
            );

            setTimeout(async () => {

                await channel.delete(
                    "Ticket geschlossen"
                ).catch(() => {});

            }, 2000);

            return;
        }
    }


    // ========================================================
    // TICKET PANEL
    // ========================================================

    if (command === "ticketpanel") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Staff-Team darf das Ticket-Panel erstellen.",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle("Tickets / Tickets")
            .setDescription(
                "Wähle dein Anliegen aus.\n" +
                "Choose your ticket type.\n\n" +

                "🛒 **Kauf Ticket / Purchase Ticket**\n" +
                "👮 **Staff Bewerbung / Staff Application**\n" +
                "❓ **Allgemeine Hilfe / General Help**\n" +
                "🤝 **Partnerschaft / Partnership**"
            )
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId("ticket_kauf")
                    .setLabel("Kauf / Purchase")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("ticket_staff")
                    .setLabel("Staff Bewerbung / Application")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("ticket_hilfe")
                    .setLabel("Hilfe / Help")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId("ticket_partner")
                    .setLabel("Partnerschaft / Partnership")
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });

        return interaction.reply({
            content:
                "Ticket-Panel wurde erstellt.",
            ephemeral: true
        });
    }


    // ========================================================
    // VERIFY PANEL
    // ========================================================

    if (command === "verifypanel") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Staff-Team darf das Verify-Panel erstellen.",
                ephemeral: true
            });
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "Verify / Verifizierung"
                )
                .setDescription(
                    "Klicke auf den Button, um dich zu verifizieren.\n\n" +
                    "Click the button below to verify yourself."
                )
                .setTimestamp();

        const row =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("verify_button")
                        .setLabel("VERIFY")
                        .setStyle(ButtonStyle.Primary)
                );

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });

        return interaction.reply({
            content:
                "Verify-Panel wurde erstellt.",
            ephemeral: true
        });
    }


    // ========================================================
    // ANNOUNCEMENT
    // ========================================================

    if (command === "announcement") {

        if (!isStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Staff-Team darf Ankündigungen erstellen.",
                ephemeral: true
            });
        }

        await interaction.deferReply({
            ephemeral: true
        });

        const title =
            interaction.options.getString("titel");

        const message =
            interaction.options.getString("nachricht");

        const ping =
            interaction.options.getBoolean("ping") || false;

        const target =
            interaction.options.getChannel("kanal") ||
            getChannel(
                interaction.guild,
                CHANNEL_ANNOUNCEMENT
            );

        if (!target) {

            return interaction.editReply(
                "Kein Ankündigungskanal gefunden."
            );
        }

        const english =
            await translateText(
                message,
                "en"
            );

        const embed =
            new EmbedBuilder()
                .setTitle(title)
                .setDescription(
                    `🇩🇪 ${message}\n\n` +
                    `🇬🇧 ${english || "Translation unavailable."}`
                )
                .setTimestamp();

        let content = "";

        if (ping) {

            const staff =
                getRole(
                    interaction.guild,
                    ROLE_STAFF
                );

            const owner =
                getRole(
                    interaction.guild,
                    ROLE_OWNER
                );

            const inhaber =
                getRole(
                    interaction.guild,
                    ROLE_INHABER
                );

            if (staff) content += `${staff} `;
            if (owner) content += `${owner} `;
            if (inhaber) content += `${inhaber}`;
        }

        await target.send({
            content: content || undefined,
            embeds: [embed]
        });

        await interaction.editReply(
            "Ankündigung wurde gesendet."
        );

        await logAction(
            interaction.guild,
            "Ankündigung",
            `${interaction.user.tag} hat eine Ankündigung in ${target} gesendet.`
        );

        return;
    }


    // ========================================================
    // TRANSLATE
    // ========================================================

    if (command === "translate") {

        const language =
            interaction.options.getString("sprache");

        const text =
            interaction.options.getString("nachricht");

        await interaction.deferReply();

        const translated =
            await translateText(
                text,
                language
            );

        if (!translated) {

            return interaction.editReply(
                "Übersetzung fehlgeschlagen."
            );
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "Translation / Übersetzung"
                )
                .setDescription(
                    translated
                )
                .setFooter({
                    text:
                        `Requested by ${interaction.user.tag}`
                })
                .setTimestamp();

        await interaction.editReply({
            embeds: [embed]
        });

        return;
    }


    // ========================================================
    // HELP
    // ========================================================

    if (command === "help") {

        let description = "";

        if (isStaff(interaction.member)) {

            description +=
                "**Staff-Team:**\n" +
                "`/ban` ` /kick` `/timeout` `/warn`\n" +
                "`/ticket` `/ticketpanel`\n" +
                "`/announcement` `/verifypanel`\n" +
                "`/sperre`\n" +
                "`/translate` `/help`\n\n";
        } else {

            description +=
                "**Member:**\n" +
                "`/ticketpanel` ` /translate` `/help`\n\n";
        }

        if (isRankStaff(interaction.member)) {

            description +=
                "**Rank Management:**\n" +
                "`/rank`\n\n";
        }

        if (isOwner(interaction.member)) {

            description +=
                "**Owner / Inhaber:**\n" +
                "`/maintenance` `/restart`\n";
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "Help / Hilfe"
                )
                .setDescription(
                    description +
                    "\n\nAlle Befehle sind nur mit den benötigten Rechten verwendbar."
                )
                .setTimestamp();

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }


    // ========================================================
    // RANK
    // ========================================================

    if (command === "rank") {

        if (!isRankStaff(interaction.member)) {

            return interaction.reply({
                content:
                    "Nur Inhaber, Owner oder Rank Beauftragter dürfen Ränge verwalten.",
                ephemeral: true
            });
        }

        const user =
            interaction.options.getUser("user");

        const role =
            interaction.options.getRole("rolle");

        const action =
            interaction.options.getString("aktion");

        const member =
            await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

        if (!member) {

            return interaction.reply({
                content:
                    "Benutzer nicht gefunden.",
                ephemeral: true
            });
        }

        if (
            role.position >=
            interaction.guild.members.me.roles.highest.position
        ) {

            return interaction.reply({
                content:
                    "Diese Rolle liegt über meiner höchsten Rolle.",
                ephemeral: true
            });
        }

        if (action === "add") {

            await member.roles.add(role);

            await interaction.reply(
                `✅ ${role} wurde ${user} gegeben.`
            );

            await logAction(
                interaction.guild,
                "Rank vergeben",
                `${interaction.user.tag} gab ${role.name} an ${user.tag}.`
            );

        } else {

            await member.roles.remove(role);

            await interaction.reply(
                `✅ ${role} wurde ${user} entfernt.`
            );

            await logAction(
                interaction.guild,
                "Rank entfernt",
                `${interaction.user.tag} entfernte ${role.name} von ${user.tag}.`
            );
        }

        return;
    }


    // ========================================================
    // LOCK / SPERRE
    // ========================================================

    if (command === "sperre") {

        if (
            !interaction.member.roles.cache.some(
                role =>
                    role.name.toLowerCase() ===
                    ROLE_MODERATOR.toLowerCase()
            )
        ) {

            return interaction.reply({
                content:
                    "Nur Moderatoren oder höhere Rollen dürfen Kanäle sperren.",
                ephemeral: true
            });
        }

        const action =
            interaction.options.getString("aktion");

        const type =
            interaction.options.getString("typ");

        const channel =
            interaction.options.getChannel("kanal") ||
            interaction.channel;

        if (type === "text") {

            if (
                channel.type !==
                ChannelType.GuildText
            ) {

                return interaction.reply({
                    content:
                        "Das ist kein Textkanal.",
                    ephemeral: true
                });
            }

            await channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages:
                        action === "unlock"
                }
            );

        } else {

            if (
                channel.type !==
                ChannelType.GuildVoice
            ) {

                return interaction.reply({
                    content:
                        "Das ist kein Voice-Kanal.",
                    ephemeral: true
                });
            }

            await channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    Connect:
                        action === "unlock"
                }
            );
        }

        await interaction.reply(
            action === "lock"
                ? `🔒 ${channel} wurde gesperrt.`
                : `🔓 ${channel} wurde entsperrt.`
        );

        await logAction(
            interaction.guild,
            "Kanal-Sperre",
            `${interaction.user.tag} hat ${channel.name} ${action === "lock" ? "gesperrt" : "entsperrt"}.`
        );

        return;
    }
});


// ============================================================
// TICKET AKTIVITÄT
// ============================================================

client.on(Events.MessageCreate, async message => {

    if (message.author.bot) return;

    const data =
        tickets.get(message.channel.id);

    if (!data) return;

    data.lastActivity = Date.now();
    data.warned = false;
});


// ============================================================
// TICKET WATCHER
// ============================================================

function startTicketWatcher() {

    setInterval(async () => {

        for (const [channelId, data] of tickets) {

            const channel =
                client.channels.cache.get(channelId);

            if (!channel) {

                tickets.delete(channelId);
                continue;
            }

            const inactive =
                Date.now() - data.lastActivity;

            const hours =
                inactive / (1000 * 60 * 60);

            // 24 Stunden
            if (
                hours >= 24 &&
                hours < 48 &&
                !data.warned
            ) {

                data.warned = true;

                await channel.send(
                    `<@${data.ownerId}>\n\n` +
                    `⚠️ **Ticket Alarm / Ticket Alert**\n` +
                    `In diesem Ticket gab es seit 24 Stunden keine Aktivität.\n` +
                    `There has been no activity in this ticket for 24 hours.\n\n` +
                    `Wenn niemand reagiert, wird das Ticket nach 48 Stunden automatisch geschlossen.\n` +
                    `If nobody responds, the ticket will automatically close after 48 hours.`
                ).catch(() => {});
            }

            // 48 Stunden
            if (hours >= 48) {

                await logAction(
                    channel.guild,
                    "Ticket automatisch geschlossen",
                    `${channel.name} wurde nach 48 Stunden Inaktivität automatisch geschlossen.`
                );

                await channel.delete(
                    "48 Stunden ohne Aktivität"
                ).catch(() => {});

                tickets.delete(channelId);
            }
        }

    }, 60 * 1000);
}


// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);