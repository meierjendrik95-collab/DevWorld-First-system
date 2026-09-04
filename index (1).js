const {
    Client,
    GatewayIntentBits,
    Events,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

// ============================================================
// KONFIGURATION
// ============================================================

const TOKEN = "DEIN_NEUER_BOT_TOKEN";
const GUILD_ID = "MTU0NDY4Mjc4MTIzNjUzMTM5MA.GzEsUa.m0y5RXwCcw8hbVcaFPyJ9mvPN3K0mc7LqhiWxM";

// Rollen
const ROLE_STAFF = "Staff-Team";
const ROLE_OWNER = "Owner";
const ROLE_FOUNDER = "Founder";
const ROLE_MODERATOR = "Moderator";
const ROLE_RANK = "Rank Beauftragter";

const ROLE_UNVERIFIED = "unverify";
const ROLE_VERIFIED = "verify";
const ROLE_NEW_MEMBER = "new member";

// Kanäle
const CHANNEL_LOGS = "Discord-Logs";
const CHANNEL_WELCOME = "welcome";
const CHANNEL_ANNOUNCEMENT = "📢・announcements";
const CHANNEL_VERIFY = "verify";

// Kategorien
const TICKET_CATEGORY = "SoS - Support tickets";
const SALES_CATEGORY = "💰 sales & customers";

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
// SPEICHER
// ============================================================

const warnings = new Map();
const tickets = new Map();
const saleOffers = new Map();
const saleRequests = new Map();

let maintenance = false;

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

function getRole(guild, name) {
    return guild.roles.cache.find(role => role.name === name);
}

function getChannel(guild, name) {
    return guild.channels.cache.find(channel => channel.name === name);
}

function getCategory(guild, name) {
    return guild.channels.cache.find(
        channel =>
            channel.name === name &&
            channel.type === ChannelType.GuildCategory
    );
}

function hasAdmin(interaction) {
    return interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
    );
}

function hasRole(interaction, roleName) {
    return interaction.member?.roles?.cache?.some(
        role => role.name === roleName
    );
}

function isStaff(interaction) {
    return (
        hasAdmin(interaction) ||
        hasRole(interaction, ROLE_STAFF)
    );
}

function isOwnerOrFounder(interaction) {
    return (
        hasAdmin(interaction) ||
        hasRole(interaction, ROLE_OWNER) ||
        hasRole(interaction, ROLE_FOUNDER)
    );
}

function isModerator(interaction) {
    return (
        isOwnerOrFounder(interaction) ||
        hasRole(interaction, ROLE_MODERATOR)
    );
}

function isTicketChannel(channel) {
    return (
        channel &&
        channel.type === ChannelType.GuildText &&
        channel.parent?.name === TICKET_CATEGORY &&
        channel.topic?.startsWith("Ticket von:")
    );
}

async function sendLog(guild, content = null, embed = null, components = []) {
    const channel = getChannel(guild, CHANNEL_LOGS);

    if (!channel) {
        console.log(`Log-Kanal "${CHANNEL_LOGS}" nicht gefunden.`);
        return null;
    }

    try {
        return await channel.send({
            content: content || undefined,
            embeds: embed ? [embed] : undefined,
            components: components.length ? components : undefined
        });
    } catch (error) {
        console.error("Log-Fehler:", error);
        return null;
    }
}

// ============================================================
// SALES-KATEGORIE ABSICHERN
// ============================================================

async function configureSalesCategory(guild) {
    const category = getCategory(guild, SALES_CATEGORY);

    if (!category) {
        console.log(`Sales-Kategorie "${SALES_CATEGORY}" nicht gefunden.`);
        return;
    }

    const everyone = guild.roles.everyone;
    const founder = getRole(guild, ROLE_FOUNDER);
    const owner = getRole(guild, ROLE_OWNER);

    try {
        // Niemand außer Founder / Owner darf schreiben
        await category.permissionOverwrites.edit(everyone, {
            SendMessages: false
        });

        if (founder) {
            await category.permissionOverwrites.edit(founder, {
                ViewChannel: true,
                SendMessages: true
            });
        }

        if (owner) {
            await category.permissionOverwrites.edit(owner, {
                ViewChannel: true,
                SendMessages: true
            });
        }

        // Bestehende Textkanäle ebenfalls absichern
        for (const channel of category.children.cache.values()) {
            if (
                channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildAnnouncement
            ) {
                await channel.permissionOverwrites.edit(everyone, {
                    SendMessages: false
                });

                if (founder) {
                    await channel.permissionOverwrites.edit(founder, {
                        ViewChannel: true,
                        SendMessages: true
                    });
                }

                if (owner) {
                    await channel.permissionOverwrites.edit(owner, {
                        ViewChannel: true,
                        SendMessages: true
                    });
                }
            }
        }

        console.log(`Sales-Kategorie "${SALES_CATEGORY}" abgesichert.`);
    } catch (error) {
        console.error("Fehler bei Sales-Kategorie:", error);
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
        .setDescription("Wartungsmodus ein oder ausschalten.")
        .addBooleanOption(option =>
            option
                .setName("status")
                .setDescription("true = an, false = aus")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Startet den Bot neu."),

    // --------------------------------------------------------
    // MODERATION
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Bannt einen Benutzer.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund")
        ),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kickt einen Benutzer.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund")
        ),

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Gibt einem Benutzer einen Timeout.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("minuten")
                .setDescription("1 bis 60 Minuten")
                .setMinValue(1)
                .setMaxValue(60)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund")
        ),

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Verwarnt einen Benutzer.")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Benutzer")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("grund")
                .setDescription("Grund")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // TICKETS
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Ticket verwalten.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Fügt einen Benutzer zum Ticket hinzu.")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Benutzer")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("close")
                .setDescription("Schließt das Ticket.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("takeover")
                .setDescription("Übernimmt das Ticket.")
        ),

    new SlashCommandBuilder()
        .setName("ticketpanel")
        .setDescription("Erstellt das Ticket-Panel."),

    // --------------------------------------------------------
    // VERIFY
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("verifypanel")
        .setDescription("Erstellt das Verify-Panel."),

    // --------------------------------------------------------
    // ANNOUNCEMENT
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("announcement")
        .setDescription("Sendet eine Ankündigung.")
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("Nachricht")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("titel")
                .setDescription("Titel")
        ),

    // --------------------------------------------------------
    // TRANSLATE
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("translate")
        .setDescription("Übersetzt einen Text.")
        .addStringOption(option =>
            option
                .setName("sprache")
                .setDescription("z.B. en, de, fr, es")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("Text")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // HELP
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Zeigt die verfügbaren Befehle."),

    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Rollen verwalten.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Gibt eine Rolle.")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Benutzer")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("rolle")
                        .setDescription("Rolle")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Entfernt eine Rolle.")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Benutzer")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("rolle")
                        .setDescription("Rolle")
                        .setRequired(true)
                )
        ),

    // --------------------------------------------------------
    // SPERRE
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("sperre")
        .setDescription("Sperrt oder entsperrt einen Kanal.")
        .addChannelOption(option =>
            option
                .setName("kanal")
                .setDescription("Kanal")
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildVoice
                )
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("status")
                .setDescription("true = sperren, false = entsperren")
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // SALE
    // --------------------------------------------------------
    //
    // Discord erlaubt nicht gleichzeitig:
    // /sale
    // und
    // /sale top
    //
    // Deshalb:
    // /sale       = Kaufanfrage
    // /sale-top   = Angebot erstellen
    //
    // Sonst würde Discord die Command-Struktur ablehnen.
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("sale")
        .setDescription("Stellt eine Kaufanfrage."),

    new SlashCommandBuilder()
        .setName("sale-top")
        .setDescription("Erstellt ein Verkaufsangebot.")
        .addStringOption(option =>
            option
                .setName("objekt")
                .setDescription("Objektname")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("preis")
                .setDescription("Verhandlungspreis in Robux")
                .setMinValue(1)
                .setRequired(true)
        ),

    // --------------------------------------------------------
    // VORSCHLAG
    // --------------------------------------------------------

    new SlashCommandBuilder()
        .setName("vorschlag")
        .setDescription("Macht einen Vorschlag.")
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("Dein Vorschlag")
                .setRequired(true)
        )

].map(command => command.toJSON());

// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, async () => {

    console.log(`Bot ist online als ${client.user.tag}`);

    try {

        const guild = await client.guilds.fetch(GUILD_ID);

        await client.application.commands.set(
            commands,
            GUILD_ID
        );

        console.log("Slash-Commands registriert.");

        await configureSalesCategory(guild);

    } catch (error) {

        console.error("Fehler beim Start:");
        console.error(error);

    }
});

// ============================================================
// INTERACTIONS
// ============================================================

client.on(Events.InteractionCreate, async interaction => {

    try {

        // ====================================================
        // BUTTONS
        // ====================================================

        if (interaction.isButton()) {

            // ------------------------------------------------
            // VERIFY
            // ------------------------------------------------

            if (interaction.customId === "verify_button") {

                const verified = getRole(
                    interaction.guild,
                    ROLE_VERIFIED
                );

                const unverified = getRole(
                    interaction.guild,
                    ROLE_UNVERIFIED
                );

                if (!verified) {
                    return interaction.reply({
                        content: "❌ Rolle `verify` wurde nicht gefunden.",
                        ephemeral: true
                    });
                }

                try {

                    await interaction.member.roles.add(verified);

                    if (unverified) {
                        await interaction.member.roles.remove(
                            unverified
                        );
                    }

                    return interaction.reply({
                        content: "✅ Du bist jetzt verifiziert.",
                        ephemeral: true
                    });

                } catch (error) {

                    console.error(error);

                    return interaction.reply({
                        content:
                            "❌ Rollen konnten nicht geändert werden.",
                        ephemeral: true
                    });
                }
            }

            // ------------------------------------------------
            // TICKET BUTTONS
            // ------------------------------------------------

            if (
                [
                    "ticket_kauf",
                    "ticket_bewerbung",
                    "ticket_hilfe",
                    "ticket_partnerschaft"
                ].includes(interaction.customId)
            ) {

                const category = getCategory(
                    interaction.guild,
                    TICKET_CATEGORY
                );

                if (!category) {
                    return interaction.reply({
                        content:
                            `❌ Die Kategorie \`${TICKET_CATEGORY}\` wurde nicht gefunden.`,
                        ephemeral: true
                    });
                }

                const existingTicket =
                    interaction.guild.channels.cache.find(
                        channel =>
                            channel.type === ChannelType.GuildText &&
                            channel.parentId === category.id &&
                            channel.topic ===
                                `Ticket von: ${interaction.user.id}`
                    );

                if (existingTicket) {
                    return interaction.reply({
                        content:
                            `❌ Du hast bereits ein Ticket: ${existingTicket}`,
                        ephemeral: true
                    });
                }

                const ticketNames = {
                    ticket_kauf: "kauf",
                    ticket_bewerbung: "bewerbung",
                    ticket_hilfe: "hilfe",
                    ticket_partnerschaft: "partnerschaft"
                };

                const ticketType =
                    ticketNames[interaction.customId];

                const safeUsername =
                    interaction.user.username
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .slice(0, 20) || "user";

                const channel = await interaction.guild.channels.create({
                    name: `ticket-${ticketType}-${safeUsername}`,
                    type: ChannelType.GuildText,
                    parent: category.id,
                    topic:
                        `Ticket von: ${interaction.user.id} | Typ: ${ticketType}`,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            deny: [
                                PermissionFlagsBits.ViewChannel
                            ]
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks
                            ]
                        }
                    ]
                });

                const staffRole = getRole(
                    interaction.guild,
                    ROLE_STAFF
                );

                if (staffRole) {
                    await channel.permissionOverwrites.edit(
                        staffRole.id,
                        {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true,
                            AttachFiles: true,
                            EmbedLinks: true,
                            ManageMessages: true
                        }
                    );
                }

                await channel.permissionOverwrites.edit(
                    client.user.id,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        ManageChannels: true,
                        ManageMessages: true
                    }
                );

                tickets.set(channel.id, {
                    ownerId: interaction.user.id,
                    staffId: null,
                    lastActivity: Date.now(),
                    warned24h: false
                });

                const embed = new EmbedBuilder()
                    .setTitle("🎫 Support Ticket")
                    .setDescription(
                        `Willkommen ${interaction.user}!\n\n` +
                        `**Ticket-Typ:** ${ticketType}\n\n` +
                        "Ein Mitglied des Staff-Teams wird sich bald um dein Anliegen kümmern."
                    )
                    .setTimestamp();

                const closeButton =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("ticket_close_button")
                            .setLabel("Ticket schließen")
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji("🔒")
                    );

                await channel.send({
                    content:
                        `${interaction.user} <@&${staffRole?.id || ""}>`,
                    embeds: [embed],
                    components: [closeButton],
                    allowedMentions: {
                        users: [interaction.user.id],
                        roles: staffRole ? [staffRole.id] : []
                    }
                });

                await sendLog(
                    interaction.guild,
                    `🎫 ${interaction.user} hat ein Ticket erstellt: ${channel}`
                );

                return interaction.reply({
                    content: `✅ Dein Ticket wurde erstellt: ${channel}`,
                    ephemeral: true
                });
            }

            // ------------------------------------------------
            // TICKET CLOSE BUTTON
            // ------------------------------------------------

            if (interaction.customId === "ticket_close_button") {

                if (!isStaff(interaction)) {
                    return interaction.reply({
                        content:
                            "❌ Nur das Staff-Team kann Tickets schließen.",
                        ephemeral: true
                    });
                }

                if (!isTicketChannel(interaction.channel)) {
                    return interaction.reply({
                        content:
                            "❌ Das ist kein Ticket.",
                        ephemeral: true
                    });
                }

                await interaction.reply(
                    "🔒 Ticket wird geschlossen..."
                );

                await sendLog(
                    interaction.guild,
                    `🔒 ${interaction.channel} wurde von ${interaction.user} geschlossen.`
                );

                tickets.delete(interaction.channel.id);

                setTimeout(async () => {
                    try {
                        await interaction.channel.delete();
                    } catch {}
                }, 3000);

                return;
            }

            // ------------------------------------------------
            // SALE ACCEPT
            // ------------------------------------------------

            if (
                interaction.customId.startsWith("sale_accept_")
            ) {

                if (!isOwnerOrFounder(interaction)) {
                    return interaction.reply({
                        content:
                            "❌ Nur Founder oder Owner können Kaufanfragen bearbeiten.",
                        ephemeral: true
                    });
                }

                const requestId =
                    interaction.customId.replace(
                        "sale_accept_",
                        ""
                    );

                const request =
                    saleRequests.get(requestId);

                if (!request) {
                    return interaction.reply({
                        content:
                            "❌ Diese Kaufanfrage existiert nicht mehr.",
                        ephemeral: true
                    });
                }

                request.status = "Angenommen";
                request.reviewedBy = interaction.user.id;

                const updatedEmbed = new EmbedBuilder()
                    .setTitle("✅ Kaufanfrage angenommen")
                    .setDescription(
                        `**Käufer:** <@${request.userId}>\n` +
                        `**Objekt:** ${request.itemName}\n` +
                        `**Verhandlungspreis:** ${request.price} Robux\n` +
                        `**Angebot des Käufers:** ${request.offer} Robux\n\n` +
                        `**Bearbeitet von:** ${interaction.user}\n\n` +
                        `**Informationen:**\n${request.reason}`
                    )
                    .setTimestamp();

                const row =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_accept_${requestId}`
                            )
                            .setLabel("Angenommen")
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_reject_${requestId}`
                            )
                            .setLabel("Abgelehnt")
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );

                await interaction.update({
                    embeds: [updatedEmbed],
                    components: [row]
                });

                const user =
                    await client.users
                        .fetch(request.userId)
                        .catch(() => null);

                if (user) {
                    try {
                        await user.send(
                            `✅ Deine Kaufanfrage für **${request.itemName}** wurde von ${interaction.user} angenommen.\n\n` +
                            `Dein Angebot: **${request.offer} Robux**`
                        );
                    } catch {}
                }

                await sendLog(
                    interaction.guild,
                    `✅ Kaufanfrage von <@${request.userId}> wurde von ${interaction.user} angenommen.`
                );

                return;
            }

            // ------------------------------------------------
            // SALE REJECT
            // ------------------------------------------------

            if (
                interaction.customId.startsWith("sale_reject_")
            ) {

                if (!isOwnerOrFounder(interaction)) {
                    return interaction.reply({
                        content:
                            "❌ Nur Founder oder Owner können Kaufanfragen bearbeiten.",
                        ephemeral: true
                    });
                }

                const requestId =
                    interaction.customId.replace(
                        "sale_reject_",
                        ""
                    );

                const request =
                    saleRequests.get(requestId);

                if (!request) {
                    return interaction.reply({
                        content:
                            "❌ Diese Kaufanfrage existiert nicht mehr.",
                        ephemeral: true
                    });
                }

                request.status = "Abgelehnt";
                request.reviewedBy = interaction.user.id;

                const updatedEmbed = new EmbedBuilder()
                    .setTitle("❌ Kaufanfrage abgelehnt")
                    .setDescription(
                        `**Käufer:** <@${request.userId}>\n` +
                        `**Objekt:** ${request.itemName}\n` +
                        `**Verhandlungspreis:** ${request.price} Robux\n` +
                        `**Angebot des Käufers:** ${request.offer} Robux\n\n` +
                        `**Bearbeitet von:** ${interaction.user}\n\n` +
                        `**Informationen:**\n${request.reason}`
                    )
                    .setTimestamp();

                const row =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_accept_${requestId}`
                            )
                            .setLabel("Angenommen")
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_reject_${requestId}`
                            )
                            .setLabel("Abgelehnt")
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );

                await interaction.update({
                    embeds: [updatedEmbed],
                    components: [row]
                });

                const user =
                    await client.users
                        .fetch(request.userId)
                        .catch(() => null);

                if (user) {
                    try {
                        await user.send(
                            `❌ Deine Kaufanfrage für **${request.itemName}** wurde von ${interaction.user} abgelehnt.\n\n` +
                            `Dein Angebot: **${request.offer} Robux**`
                        );
                    } catch {}
                }

                await sendLog(
                    interaction.guild,
                    `❌ Kaufanfrage von <@${request.userId}> wurde von ${interaction.user} abgelehnt.`
                );

                return;
            }

            return;
        }

        // ====================================================
        // SELECT MENU
        // ====================================================

        if (interaction.isStringSelectMenu()) {

            if (interaction.customId === "sale_select") {

                const offerId = interaction.values[0];
                const item = saleOffers.get(offerId);

                if (!item) {
                    return interaction.reply({
                        content:
                            "❌ Dieses Verkaufsangebot existiert nicht mehr.",
                        ephemeral: true
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(
                        `sale_modal_${offerId}`
                    )
                    .setTitle("Kaufanfrage");

                const offerInput =
                    new TextInputBuilder()
                        .setCustomId("offer")
                        .setLabel(
                            "Dein Preisvorschlag in Robux"
                        )
                        .setPlaceholder(
                            `Richtwert: ${item.price} Robux`
                        )
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                const reasonInput =
                    new TextInputBuilder()
                        .setCustomId("reason")
                        .setLabel(
                            "Weitere Informationen"
                        )
                        .setPlaceholder(
                            "Optional"
                        )
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        offerInput
                    ),
                    new ActionRowBuilder().addComponents(
                        reasonInput
                    )
                );

                return interaction.showModal(modal);
            }

            return;
        }

        // ====================================================
        // MODAL
        // ====================================================

        if (interaction.isModalSubmit()) {

            if (
                interaction.customId.startsWith(
                    "sale_modal_"
                )
            ) {

                const offerId =
                    interaction.customId.replace(
                        "sale_modal_",
                        ""
                    );

                const item =
                    saleOffers.get(offerId);

                if (!item) {
                    return interaction.reply({
                        content:
                            "❌ Dieses Verkaufsangebot existiert nicht mehr.",
                        ephemeral: true
                    });
                }

                const offerText =
                    interaction.fields.getTextInputValue(
                        "offer"
                    );

                const offer =
                    Number(
                        offerText
                            .replace(/\./g, "")
                            .replace(/,/g, "")
                            .replace(/\s/g, "")
                    );

                if (
                    !Number.isInteger(offer) ||
                    offer <= 0
                ) {
                    return interaction.reply({
                        content:
                            "❌ Bitte gib einen gültigen Preis in Robux ein, z.B. `500`.",
                        ephemeral: true
                    });
                }

                const reason =
                    interaction.fields.getTextInputValue(
                        "reason"
                    ) ||
                    "Keine weiteren Informationen.";

                const requestId =
                    `${interaction.user.id}-${Date.now()}`;

                saleRequests.set(requestId, {
                    userId: interaction.user.id,
                    itemName: item.object,
                    price: item.price,
                    offer,
                    reason,
                    status: "Offen",
                    reviewedBy: null
                });

                const embed = new EmbedBuilder()
                    .setTitle("💰 Neue Kaufanfrage")
                    .setDescription(
                        `**Käufer:** ${interaction.user}\n` +
                        `**Objekt:** ${item.object}\n` +
                        `**Verhandlungspreis:** ${item.price} Robux\n` +
                        `**Angebot des Käufers:** ${offer} Robux\n\n` +
                        `**Informationen:**\n${reason}`
                    )
                    .setFooter({
                        text: `Anfrage-ID: ${requestId}`
                    })
                    .setTimestamp();

                const buttons =
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_accept_${requestId}`
                            )
                            .setLabel("Annehmen")
                            .setStyle(ButtonStyle.Success)
                            .setEmoji("✅"),
                        new ButtonBuilder()
                            .setCustomId(
                                `sale_reject_${requestId}`
                            )
                            .setLabel("Ablehnen")
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji("❌")
                    );

                const logMessage = await sendLog(
                    interaction.guild,
                    `${interaction.user} hat eine Kaufanfrage gestellt.`,
                    embed,
                    [buttons]
                );

                if (!logMessage) {
                    saleRequests.delete(requestId);

                    return interaction.reply({
                        content:
                            "❌ Die Kaufanfrage konnte nicht an Discord-Logs gesendet werden.",
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    content:
                        "✅ Deine Kaufanfrage wurde an Founder und Owner weitergeleitet.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // CHAT INPUT COMMANDS
        // ====================================================

        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command = interaction.commandName;

        // ====================================================
        // MAINTENANCE
        // ====================================================

        if (command === "maintenance") {

            if (!hasAdmin(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Administrator-Rechte benötigt.",
                    ephemeral: true
                });
            }

            maintenance =
                interaction.options.getBoolean(
                    "status"
                );

            return interaction.reply(
                maintenance
                    ? "🔧 Wartungsmodus ist AN."
                    : "✅ Wartungsmodus ist AUS."
            );
        }

        // ====================================================
        // RESTART
        // ====================================================

        if (command === "restart") {

            if (!hasAdmin(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Administrator-Rechte benötigt.",
                    ephemeral: true
                });
            }

            await interaction.reply(
                "🔄 Bot wird neu gestartet..."
            );

            await sendLog(
                interaction.guild,
                `🔄 Bot-Neustart durch ${interaction.user}.`
            );

            process.exit(0);
        }

        // Während Maintenance blockieren
        if (maintenance) {
            return interaction.reply({
                content:
                    "🔧 Der Bot befindet sich im Wartungsmodus.",
                ephemeral: true
            });
        }

        // ====================================================
        // BAN
        // ====================================================

        if (command === "ban") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
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

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Benutzer nicht gefunden.",
                    ephemeral: true
                });
            }

            try {

                await member.ban({
                    reason
                });

                await interaction.reply(
                    `🔨 ${user.tag} wurde gebannt.\nGrund: ${reason}`
                );

                await sendLog(
                    interaction.guild,
                    `🔨 ${user} wurde von ${interaction.user} gebannt.\nGrund: ${reason}`
                );

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "❌ Bann fehlgeschlagen.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // KICK
        // ====================================================

        if (command === "kick") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
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

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Benutzer nicht gefunden.",
                    ephemeral: true
                });
            }

            try {

                await member.kick(reason);

                await interaction.reply(
                    `👢 ${user.tag} wurde gekickt.\nGrund: ${reason}`
                );

                await sendLog(
                    interaction.guild,
                    `👢 ${user} wurde von ${interaction.user} gekickt.\nGrund: ${reason}`
                );

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "❌ Kick fehlgeschlagen.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // TIMEOUT
        // ====================================================

        if (command === "timeout") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const user =
                interaction.options.getUser("user");

            const minutes =
                interaction.options.getInteger(
                    "minuten"
                );

            const reason =
                interaction.options.getString("grund") ||
                "Kein Grund angegeben.";

            const member =
                await interaction.guild.members
                    .fetch(user.id)
                    .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Benutzer nicht gefunden.",
                    ephemeral: true
                });
            }

            try {

                await member.timeout(
                    minutes * 60 * 1000,
                    reason
                );

                await interaction.reply(
                    `⏱️ ${user.tag} bekam einen Timeout für ${minutes} Minuten.`
                );

                await sendLog(
                    interaction.guild,
                    `⏱️ ${user} erhielt von ${interaction.user} ${minutes} Minuten Timeout.\nGrund: ${reason}`
                );

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "❌ Timeout fehlgeschlagen.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // WARN
        // ====================================================

        if (command === "warn") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const user =
                interaction.options.getUser("user");

            const reason =
                interaction.options.getString(
                    "grund"
                );

            const member =
                await interaction.guild.members
                    .fetch(user.id)
                    .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Benutzer nicht gefunden.",
                    ephemeral: true
                });
            }

            const warningKey =
                `${interaction.guild.id}:${user.id}`;

            let count =
                (warnings.get(warningKey) || 0) + 1;

            warnings.set(
                warningKey,
                count
            );

            const actions = {
                3: 5,
                6: 10,
                9: 15,
                12: 20,
                15: 25,
                18: 30,
                21: 45,
                24: 60
            };

            if (count >= 27) {

                try {
                    await member.kick(
                        "27 Warnungen erreicht"
                    );
                } catch {}

                warnings.delete(
                    warningKey
                );

                await interaction.reply(
                    `🚨 ${user.tag} wurde nach 27 Warnungen gekickt.`
                );

                await sendLog(
                    interaction.guild,
                    `🚨 ${user} wurde nach 27 Warnungen von ${interaction.user} gekickt.`
                );

                return;
            }

            if (actions[count]) {

                const minutes =
                    actions[count];

                try {
                    await member.timeout(
                        minutes * 60 * 1000,
                        `Warnung ${count}: ${reason}`
                    );
                } catch {}

                await interaction.reply(
                    `⚠️ ${user.tag} wurde verwarnt.\n` +
                    `Warnungen: ${count}\n` +
                    `Timeout: ${minutes} Minuten\n` +
                    `Grund: ${reason}`
                );

            } else {

                await interaction.reply(
                    `⚠️ ${user.tag} wurde verwarnt.\n` +
                    `Warnungen: ${count}\n` +
                    `Grund: ${reason}`
                );
            }

            try {
                await user.send(
                    `⚠️ Du wurdest auf **${interaction.guild.name}** verwarnt.\n` +
                    `Warnungen: ${count}\n` +
                    `Grund: ${reason}`
                );
            } catch {}

            await sendLog(
                interaction.guild,
                `⚠️ ${user} erhielt Warnung ${count} von ${interaction.user}.\nGrund: ${reason}`
            );

            return;
        }

        // ====================================================
        // TICKET
        // ====================================================

        if (command === "ticket") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const subcommand =
                interaction.options.getSubcommand();

            // ------------------------------------------------
            // ADD
            // ------------------------------------------------

            if (subcommand === "add") {

                if (!isTicketChannel(
                    interaction.channel
                )) {
                    return interaction.reply({
                        content:
                            "❌ Nur in einem Ticket.",
                        ephemeral: true
                    });
                }

                const user =
                    interaction.options.getUser(
                        "user"
                    );

                await interaction.channel
                    .permissionOverwrites.edit(
                        user.id,
                        {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true,
                            AttachFiles: true,
                            EmbedLinks: true
                        }
                    );

                await interaction.reply(
                    `✅ ${user} wurde zum Ticket hinzugefügt.`
                );

                await sendLog(
                    interaction.guild,
                    `➕ ${user} wurde von ${interaction.user} zu ${interaction.channel} hinzugefügt.`
                );

                return;
            }

            // ------------------------------------------------
            // CLOSE
            // ------------------------------------------------

            if (subcommand === "close") {

                if (!isTicketChannel(
                    interaction.channel
                )) {
                    return interaction.reply({
                        content:
                            "❌ Nur in einem Ticket.",
                        ephemeral: true
                    });
                }

                await interaction.reply(
                    "🔒 Ticket wird geschlossen..."
                );

                await sendLog(
                    interaction.guild,
                    `🔒 ${interaction.channel} wurde von ${interaction.user} geschlossen.`
                );

                tickets.delete(
                    interaction.channel.id
                );

                setTimeout(async () => {
                    try {
                        await interaction.channel.delete();
                    } catch {}
                }, 3000);

                return;
            }

            // ------------------------------------------------
            // TAKEOVER
            // ------------------------------------------------

            if (subcommand === "takeover") {

                if (!isTicketChannel(
                    interaction.channel
                )) {
                    return interaction.reply({
                        content:
                            "❌ Nur in einem Ticket.",
                        ephemeral: true
                    });
                }

                const ticket =
                    tickets.get(
                        interaction.channel.id
                    );

                if (ticket) {
                    ticket.staffId =
                        interaction.user.id;
                }

                await interaction.reply(
                    `🛡️ ${interaction.user} hat das Ticket übernommen.`
                );

                await sendLog(
                    interaction.guild,
                    `🛡️ ${interaction.user} hat ${interaction.channel} übernommen.`
                );

                return;
            }
        }

        // ====================================================
        // TICKET PANEL
        // ====================================================

        if (command === "ticketpanel") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🎫 Support Tickets")
                .setDescription(
                    "Wähle dein Anliegen.\n\n" +
                    "🛒 Kauf / Purchase\n" +
                    "📋 Staff Bewerbung / Application\n" +
                    "❓ Allgemeine Hilfe / General Help\n" +
                    "🤝 Partnerschaft / Partnership"
                )
                .setTimestamp();

            const row1 =
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_kauf"
                        )
                        .setLabel(
                            "Kauf / Purchase"
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji("🛒"),

                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_bewerbung"
                        )
                        .setLabel(
                            "Bewerbung / Application"
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji("📋")
                );

            const row2 =
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_hilfe"
                        )
                        .setLabel(
                            "Hilfe / Help"
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji("❓"),

                    new ButtonBuilder()
                        .setCustomId(
                            "ticket_partnerschaft"
                        )
                        .setLabel(
                            "Partnerschaft / Partnership"
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji("🤝")
                );

            await interaction.channel.send({
                embeds: [embed],
                components: [
                    row1,
                    row2
                ]
            });

            return interaction.reply({
                content:
                    "✅ Ticket-Panel erstellt.",
                ephemeral: true
            });
        }

        // ====================================================
        // VERIFY PANEL
        // ====================================================

        if (command === "verifypanel") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle("🔵 Verify")
                .setDescription(
                    "Klicke auf **Verify**, um dich zu verifizieren.\n\n" +
                    "Click **Verify** to verify yourself."
                )
                .setTimestamp();

            const row =
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            "verify_button"
                        )
                        .setLabel("Verify")
                        .setStyle(
                            ButtonStyle.Primary
                        )
                        .setEmoji("✅")
                );

            await interaction.channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content:
                    "✅ Verify-Panel erstellt.",
                ephemeral: true
            });
        }

        // ====================================================
        // ANNOUNCEMENT
        // ====================================================

        if (command === "announcement") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const text =
                interaction.options.getString(
                    "text"
                );

            const title =
                interaction.options.getString(
                    "titel"
                ) ||
                "📢 Ankündigung";

            const channel =
                getChannel(
                    interaction.guild,
                    CHANNEL_ANNOUNCEMENT
                );

            if (!channel) {
                return interaction.reply({
                    content:
                        `❌ ${CHANNEL_ANNOUNCEMENT} wurde nicht gefunden.`,
                    ephemeral: true
                });
            }

            const newMemberRole =
                getRole(
                    interaction.guild,
                    ROLE_NEW_MEMBER
                );

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(text)
                .setTimestamp();

            let content =
                "@everyone";

            if (newMemberRole) {
                content +=
                    ` <@&${newMemberRole.id}>`;
            }

            await channel.send({
                content,
                embeds: [embed],
                allowedMentions: {
                    parse: ["everyone"],
                    roles: newMemberRole
                        ? [newMemberRole.id]
                        : []
                }
            });

            await sendLog(
                interaction.guild,
                `📢 ${interaction.user} hat eine Ankündigung gesendet.`
            );

            return interaction.reply({
                content:
                    "✅ Ankündigung wurde gesendet.",
                ephemeral: true
            });
        }

        // ====================================================
        // TRANSLATE
        // ====================================================

        if (command === "translate") {

            const language =
                interaction.options.getString(
                    "sprache"
                );

            const text =
                interaction.options.getString(
                    "text"
                );

            await interaction.deferReply();

            try {

                const url =
                    "https://translate.googleapis.com/translate_a/single" +
                    `?client=gtx&sl=auto&tl=${encodeURIComponent(language)}` +
                    `&dt=t&q=${encodeURIComponent(text)}`;

                const response =
                    await fetch(url);

                if (!response.ok) {
                    throw new Error(
                        "Übersetzungsserver antwortet nicht."
                    );
                }

                const data =
                    await response.json();

                const translated =
                    data?.[0]
                        ?.map(part => part?.[0])
                        .filter(Boolean)
                        .join("") ||
                    "Keine Übersetzung gefunden.";

                return interaction.editReply(
                    `🌐 **Übersetzung (${language}):**\n${translated}`
                );

            } catch (error) {

                console.error(
                    "Translate-Fehler:",
                    error
                );

                return interaction.editReply(
                    "❌ Übersetzung fehlgeschlagen."
                );
            }
        }

        // ====================================================
        // HELP
        // ====================================================

        if (command === "help") {

            const embed = new EmbedBuilder()
                .setTitle("📚 Bot Commands")
                .setDescription(
                    "**Allgemein**\n" +
                    "`/help` - Hilfe\n" +
                    "`/translate` - Übersetzen\n" +
                    "`/vorschlag` - Vorschlag senden\n" +
                    "`/sale` - Kaufanfrage\n\n" +

                    "**Tickets**\n" +
                    "`/ticket add` - Benutzer hinzufügen\n" +
                    "`/ticket close` - Ticket schließen\n" +
                    "`/ticket takeover` - Ticket übernehmen\n\n" +

                    "**Moderation**\n" +
                    "`/ban`\n" +
                    "`/kick`\n" +
                    "`/timeout`\n" +
                    "`/warn`\n\n" +

                    "**Staff**\n" +
                    "`/ticketpanel`\n" +
                    "`/verifypanel`\n" +
                    "`/announcement`\n" +
                    "`/rank`\n" +
                    "`/sperre`\n\n" +

                    "**Founder / Owner**\n" +
                    "`/sale-top` - Verkaufsangebot erstellen"
                )
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // ====================================================
        // RANK
        // ====================================================

        if (command === "rank") {

            if (!hasAdmin(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Administrator-Rechte benötigt.",
                    ephemeral: true
                });
            }

            const subcommand =
                interaction.options.getSubcommand();

            const user =
                interaction.options.getUser(
                    "user"
                );

            const role =
                interaction.options.getRole(
                    "rolle"
                );

            const member =
                await interaction.guild.members
                    .fetch(user.id)
                    .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Benutzer nicht gefunden.",
                    ephemeral: true
                });
            }

            if (
                role.position >=
                interaction.member.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ Diese Rolle ist zu hoch für dich.",
                    ephemeral: true
                });
            }

            if (
                role.position >=
                interaction.guild.members.me.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ Meine Bot-Rolle ist nicht hoch genug.",
                    ephemeral: true
                });
            }

            try {

                if (subcommand === "add") {

                    await member.roles.add(
                        role
                    );

                    await interaction.reply(
                        `✅ ${role} wurde ${user} gegeben.`
                    );

                    await sendLog(
                        interaction.guild,
                        `➕ ${interaction.user} gab ${role} an ${user}.`
                    );

                }

                if (subcommand === "remove") {

                    await member.roles.remove(
                        role
                    );

                    await interaction.reply(
                        `✅ ${role} wurde ${user} entfernt.`
                    );

                    await sendLog(
                        interaction.guild,
                        `➖ ${interaction.user} entfernte ${role} von ${user}.`
                    );
                }

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "❌ Rolle konnte nicht geändert werden.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // SPERRE
        // ====================================================

        if (command === "sperre") {

            if (!isStaff(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Staff-Team.",
                    ephemeral: true
                });
            }

            const channel =
                interaction.options.getChannel(
                    "kanal"
                );

            const status =
                interaction.options.getBoolean(
                    "status"
                );

            try {

                if (
                    channel.type ===
                    ChannelType.GuildVoice
                ) {

                    await channel.permissionOverwrites
                        .edit(
                            interaction.guild.roles.everyone,
                            {
                                Connect: !status,
                                Speak: !status
                            }
                        );

                } else {

                    await channel.permissionOverwrites
                        .edit(
                            interaction.guild.roles.everyone,
                            {
                                SendMessages: !status
                            }
                        );
                }

                await interaction.reply(
                    status
                        ? `🔒 ${channel} wurde gesperrt.`
                        : `🔓 ${channel} wurde entsperrt.`
                );

                await sendLog(
                    interaction.guild,
                    `${status ? "🔒" : "🔓"} ${channel} wurde von ${interaction.user} ${status ? "gesperrt" : "entsperrt"}.`
                );

            } catch (error) {

                console.error(error);

                return interaction.reply({
                    content:
                        "❌ Kanal konnte nicht geändert werden.",
                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // SALE
        // ====================================================

        if (command === "sale") {

            if (saleOffers.size === 0) {
                return interaction.reply({
                    content:
                        "❌ Aktuell sind keine Verkaufsangebote verfügbar.",
                    ephemeral: true
                });
            }

            const options =
                [...saleOffers.values()]
                    .slice(0, 25)
                    .map(item => ({
                        label:
                            item.object
                                .slice(0, 100),
                        description:
                            `Verhandlungspreis: ${item.price} Robux`
                                .slice(0, 100),
                        value: item.id
                    }));

            const menu =
                new StringSelectMenuBuilder()
                    .setCustomId(
                        "sale_select"
                    )
                    .setPlaceholder(
                        "Objekt auswählen"
                    )
                    .addOptions(options);

            const row =
                new ActionRowBuilder()
                    .addComponents(menu);

            return interaction.reply({
                content:
                    "💰 Wähle das Objekt, für das du eine Kaufanfrage stellen möchtest:",
                components: [row],
                ephemeral: true
            });
        }

        // ====================================================
        // SALE-TOP
        // ====================================================

        if (command === "sale-top") {

            if (!isOwnerOrFounder(interaction)) {
                return interaction.reply({
                    content:
                        "❌ Nur Founder oder Owner können Verkaufsangebote erstellen.",
                    ephemeral: true
                });
            }

            const object =
                interaction.options.getString(
                    "objekt"
                );

            const price =
                interaction.options.getInteger(
                    "preis"
                );

            const id =
                `${interaction.user.id}-${Date.now()}`;

            saleOffers.set(id, {
                id,
                object,
                price,
                createdBy:
                    interaction.user.id
            });

            await interaction.reply(
                `✅ Verkaufsangebot erstellt.\n\n` +
                `**Objekt:** ${object}\n` +
                `**Verhandlungspreis:** ${price} Robux`
            );

            const embed = new EmbedBuilder()
                .setTitle("💰 Neues Verkaufsangebot")
                .setDescription(
                    `**Objekt:** ${object}\n` +
                    `**Verhandlungspreis:** ${price} Robux\n` +
                    `**Erstellt von:** ${interaction.user}`
                )
                .setTimestamp();

            await sendLog(
                interaction.guild,
                null,
                embed
            );

            return;
        }

        // ====================================================
        // VORSCHLAG
        // ====================================================

        if (command === "vorschlag") {

            const text =
                interaction.options.getString(
                    "text"
                );

            const embed = new EmbedBuilder()
                .setTitle("💡 Neuer Vorschlag")
                .setDescription(text)
                .addFields({
                    name: "Von",
                    value: `${interaction.user}`,
                    inline: true
                })
                .setTimestamp();

            const logMessage =
                await sendLog(
                    interaction.guild,
                    null,
                    embed
                );

            if (!logMessage) {
                return interaction.reply({
                    content:
                        "❌ Vorschlag konnte nicht in Discord-Logs gesendet werden.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "✅ Dein Vorschlag wurde an Discord-Logs gesendet.",
                ephemeral: true
            });
        }

    } catch (error) {

        console.error(
            "Interaction-Fehler:",
            error
        );

        if (interaction.replied ||
            interaction.deferred) {

            try {
                await interaction.followUp({
                    content:
                        "❌ Bei der Ausführung ist ein Fehler aufgetreten.",
                    ephemeral: true
                });
            } catch {}

        } else {

            try {
                await interaction.reply({
                    content:
                        "❌ Bei der Ausführung ist ein Fehler aufgetreten.",
                    ephemeral: true
                });
            } catch {}
        }
    }
});

// ============================================================
// MEMBER JOIN
// ============================================================

client.on(
    Events.GuildMemberAdd,
    async member => {

        try {

            const welcomeChannel =
                getChannel(
                    member.guild,
                    CHANNEL_WELCOME
                );

            const unverifiedRole =
                getRole(
                    member.guild,
                    ROLE_UNVERIFIED
                );

            if (unverifiedRole) {
                await member.roles.add(
                    unverifiedRole
                );
            }

            if (welcomeChannel) {
                await welcomeChannel.send(
                    `👋 Willkommen ${member} auf dem Server!`
                );
            }

        } catch (error) {

            console.error(
                "GuildMemberAdd-Fehler:",
                error
            );
        }
    }
);

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(
    Events.MessageCreate,
    async message => {

        if (message.author.bot) {
            return;
        }

        const ticket =
            tickets.get(
                message.channel.id
            );

        if (ticket) {

            ticket.lastActivity =
                Date.now();

            ticket.warned24h =
                false;
        }
    }
);

// ============================================================
// TICKET AKTIVITÄT
// ============================================================

setInterval(
    async () => {

        const now =
            Date.now();

        for (
            const [channelId, ticket]
            of tickets.entries()
        ) {

            const channel =
                client.channels.cache.get(
                    channelId
                );

            if (!channel) {

                tickets.delete(
                    channelId
                );

                continue;
            }

            const inactiveTime =
                now -
                ticket.lastActivity;

            // ----------------------------------------------
            // 24 STUNDEN
            // ----------------------------------------------

            if (
                inactiveTime >=
                    24 * 60 * 60 * 1000 &&
                !ticket.warned24h
            ) {

                ticket.warned24h =
                    true;

                try {

                    await channel.send({
                        content:
                            `<@${ticket.ownerId}>`,
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "⚠️ Ticket seit 24 Stunden inaktiv"
                                )
                                .setDescription(
                                    "Dieses Ticket war seit 24 Stunden inaktiv.\n" +
                                    "Wenn keine weitere Aktivität erfolgt, wird es nach 48 Stunden automatisch geschlossen."
                                )
                                .setTimestamp()
                        ],
                        allowedMentions: {
                            users: [
                                ticket.ownerId
                            ]
                        }
                    });

                } catch (error) {

                    console.error(
                        "24h Ticketwarnung:",
                        error
                    );
                }
            }

            // ----------------------------------------------
            // 48 STUNDEN
            // ----------------------------------------------

            if (
                inactiveTime >=
                48 * 60 * 60 * 1000
            ) {

                try {

                    await channel.send(
                        "🔒 Dieses Ticket wurde wegen 48 Stunden Inaktivität automatisch geschlossen."
                    );

                    setTimeout(
                        async () => {

                            try {
                                await channel.delete();
                            } catch {}

                        },
                        3000
                    );

                } catch (error) {

                    console.error(
                        "48h Ticket-Schließung:",
                        error
                    );
                }

                tickets.delete(
                    channelId
                );
            }
        }

    },
    10 * 60 * 1000
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN).catch(error => {

    console.error(
        "Login fehlgeschlagen:"
    );

    console.error(error);

});
