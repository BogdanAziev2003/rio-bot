const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();
const fs = require("fs");
const moment = require("moment-timezone");
const path = require("path");
const xlsxPopulate = require("xlsx-populate");

let groupId = Number(process.env.GROUP_ID);
let isGoodChange = false;

let data = {
    totalPrice: 3710,
    deliveryPrice: 150,
    cartPrice: 3560,
    address: "г. Беслан, ул. Кирова 46",
    phone: "+7 (543) 534-53-45",
    delMethod: "delivery",
    payMethod: "card",
    comment: "Без сыра, пожлуйста",
    itemsInCart: [
        {
            name: "Бургер",
            price: 340,
            count: 4,
            modifiers: [
                {
                    name: "Сыр",
                    price: 30,
                },
                {
                    name: "Халапенье",
                    price: 30,
                },
            ],
            sizes: [
                {
                    title: "Стандарт",
                    price: 310,
                    discount_price: null,
                },
            ],
        },
        {
            name: "Бургер",
            price: 280,
            count: 3,
            modifiers: [
                {
                    name: "Сыр",
                    price: 30,
                },
                {
                    name: "Халапенье",
                    price: 30,
                },
            ],
            sizes: [
                {
                    title: "Стандарт",
                    price: 310,
                    discount_price: null,
                },
            ],
        },
        {
            name: "Шаурма",
            price: 390,
            count: 3,
            modifiers: [
                {
                    name: "Халапенье",
                    price: 30,
                },
            ],
            sizes: [
                {
                    title: "Экстра",
                    price: 390,
                    discount_price: null,
                },
            ],
        },
        {
            name: "Шаурма",
            price: 340,
            count: 1,
            modifiers: [
                {
                    name: "Халапенье",
                    price: 30,
                },
            ],
            sizes: [
                {
                    title: "Стандарт",
                    price: 310,
                    discount_price: null,
                },
            ],
        },
    ],
};

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (msg.text === "/start" && chatId !== groupId) {
        const welcomeMessage = `
        Добро пожаловать! 🍽️\n\nЯ бот, который поможет заказть еду с ресторана Good Food. Вы можете выбрать блюда из нашего меню и сделать заказ. 😊\n\nДля просмотра меню и совершения заказа, воспользуйтесь кнопкой ниже:
        `;

        await bot.sendMessage(chatId, welcomeMessage, {
            reply_markup: {
                keyboard: [
                    [
                        {
                            text: "Меню 🍔",
                            web_app: {
                                url: "https://cosmic-pothos-b8782a.netlify.app/",
                            },
                        },
                    ],
                ],
                resize_keyboard: true,
            },
        });
    }
    if (msg.text === "/data" && chatId !== groupId) {
        let splitedItems = splitCart(data.itemsInCart);
        let cartText = createCartText(splitedItems);
        let orderText = `${cartText}\n${createOrderText(data)}`;

        let textToSend = `Новый заказ: \n${orderText}`;
        bot.sendMessage(chatId, textToSend, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Подтвердить", callback_data: "acceptButton" },
                        { text: "Отменить", callback_data: "cancelButton" },
                    ],
                ],
            },
        });

        bot.once("callback_query", (callbackQuery) => {
            const action = callbackQuery.data;
            const msg = callbackQuery.message;
            const msgId = msg.message_id;

            // В зависимости от нажатой кнопки, выполняем нужное действие
            switch (action) {
                case "acceptButton":
                    // Действия при нажатии на кнопку "Подтвердить"

                    bot.editMessageReplyMarkup(
                        { inline_keyboard: [] },
                        {
                            chat_id: chatId,
                            message_id: msgId,
                        }
                    );

                    axios.post(
                        "https://server.tg-delivery.ru/api/rio/create-order",
                        {
                            username: msg.chat?.username,
                            tgId: chatId,
                            price: data.totalPrice,
                        }
                    );

                    let textForGroup = `${textToSend}\n\nTelegram ID: ${chatId}`;
                    bot.sendMessage(chatId, "Ваш заказ был подтвержден");
                    bot.sendMessage(groupId, textForGroup);
                    break;
                case "cancelButton":
                    // Действия при нажатии на кнопку "Отменить"

                    bot.editMessageReplyMarkup(
                        { inline_keyboard: [] },
                        {
                            chat_id: chatId,
                            message_id: msgId,
                        }
                    );

                    bot.sendMessage(chatId, "Ваш заказ был отменен");
                    break;
                default:
                    // По умолчанию, если кнопка не распознана
                    bot.sendMessage(chatId, "Неизвестная кнопка.");
            }
        });
    }
    if (msg?.web_app_data?.data) {
        const data = JSON.parse(msg?.web_app_data?.data);
        bot.sendMessage(chatId, "Пришли данные ");
    }

    if (msg.text === "Меню" && chatId !== groupId) {
        await bot.sendMessage(
            chatId,
            "Нажмите на кнопку, что бы открыть меню",
            {
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: "Меню 🍔",
                                web_app: {
                                    url: "https://good-food.tg-delivery.ru/",
                                },
                            },
                        ],
                    ],
                    resize_keyboard: true,
                },
            }
        );
    }

    if (chatId === groupId) {
        if (msg.text === "Админка") {
            await bot.sendMessage(chatId, "Панель администратора", {
                reply_markup: {
                    keyboard: [[{ text: "Блюда" }, { text: "Заказы" }]],
                    resize_keyboard: true,
                },
            });
        } else if (msg.text === "Блюда") {
            fetchData(
                "https://server.tg-delivery.ru/api/rio/get-goods-names"
            ).then((data) => {
                let message = String(
                    data.map((el) => {
                        return `${el.id}. ${el.name} - ${el.stock}\n`;
                    })
                ).replaceAll(",", "");

                bot.sendMessage(chatId, message);
                bot.sendMessage(chatId, "Введите id товара");
                isGoodChange = true;
            });
        } else if (msg.text === "Заказы") {
            fetchData("https://server.tg-delivery.ru/api/rio/get-orders").then(
                (data) => {
                    let xlsxPath = path.join(
                        __dirname,
                        "orders",
                        `${getCurrentDateTime()}.xlsx`
                    );
                    fs.writeFileSync(xlsxPath, "");

                    data = AOOtoAOA(data);
                    xlsxPopulate
                        .fromBlankAsync()
                        .then((workbook) => {
                            // Получение первого листа
                            const sheet = workbook.sheet(0);

                            // Запись данных в лист
                            data.forEach((row, rowIndex) => {
                                row.forEach((value, columnIndex) => {
                                    sheet
                                        .cell(rowIndex + 1, columnIndex + 1)
                                        .value(value);
                                });
                            });

                            // Сохранение книги в файл
                            return workbook.toFileAsync(xlsxPath);
                        })
                        .then(() => {
                            bot.sendDocument(
                                chatId,
                                xlsxPath,
                                {},
                                {
                                    contentType:
                                        "pplication/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                }
                            );
                        });
                }
            );
        } else if (isGoodChange) {
            let id = Number(msg.text);
            fetchData(
                "https://server.tg-delivery.ru/api/rio/get-goods-names"
            ).then((data) => {
                const arrayOfId = data.map((el) => el.id);
                if (!arrayOfId.includes(id)) {
                    bot.sendMessage(groupId, "Такого Id не существует");
                    return;
                }

                axios
                    .put("https://server.tg-delivery.ru/api/rio/change-stock", {
                        id: id,
                    })
                    .then((res) => {
                        if (res.status !== 204) {
                            bot.sendMessage(
                                groupId,
                                "Упс, что-то пошло не так"
                            );
                            bot.sendMessage(
                                process.env.MY_TG_ID,
                                "Не смогли изменить stock"
                            );
                        } else {
                            bot.sendMessage(
                                groupId,
                                "Данные были успешно изменены"
                            );
                        }
                    });
            });
        } else if (msg.reply_to_message) {
            const repliedMessageText = msg?.reply_to_message?.text; //текст сообщения, на которое был отпрален ответ
            if (msg.text === undefined || !repliedMessageText) {
                return;
            }

            const splitedRepliedMessageText = repliedMessageText.split("\n")
            const tgIdStroke = splitedRepliedMessageText.filter( el => el.includes("Telegram ID"))
            if(!tgIdStroke.length){
                return;
            }
            const tgIdToReply = tgIdStroke[0].split(":")[1].trim()
            bot.sendMessage(tgIdToReply, msg.text)
        }
        isGoodChange = false;
    }
});

async function fetchData(url) {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Fetch error:", error.message);
        bot.sendMessage(process.env.MY_TG_ID, "Fetch error: " + error.message);
    }
}

function AOOtoAOA(arr) {
    return arr.map((obj) => {
        let array = [];
        for (let key in obj) {
            array.push(obj[key]);
        }
        return array;
    });
}

function getCurrentDateTime() {
    // Получаем текущую дату и время с учетом часового пояса +3
    const currentDate = moment().tz("Europe/Moscow");

    // Форматируем дату и время с разделителями
    return currentDate.format("YYYY-MM-DD_HH-mm-ss");
}

function createCartText(data) {
    return data
        .map((el, index) => {
            const modifiersText = el.modifiers
                .map((modifier) => `доп. ${modifier.name}`)
                .join("\n");

            return `${index + 1}. ${el.name} (${el.price} ₽) x ${el.count}
Размер: ${el.sizes[0].title}
${modifiersText}
`;
        })
        .join("\n");
}

function splitCart(itemInCard) {
    const itemsCount = itemInCard.reduce((acc, item) => {
        const existingItem = acc.find(
            (i) =>
                i.title === item.title &&
                JSON.stringify(i.modifiers) ===
                    JSON.stringify(item.modifiers) &&
                JSON.stringify(i.sizes) === JSON.stringify(item.sizes)
        );

        if (existingItem) {
            existingItem.count += 1;
        } else {
            acc.push({ ...item, count: 1 });
        }
        return acc;
    }, []);

    return itemsCount;
}

function createOrderText(data) {
    const phoneText = `Номер телефона: ${data.phone}`;
    const paymentMethodText = `Метод оплаты: ${
        data.payMethod === "cash" ? "Наличными" : "Переводом"
    }`;
    const deliveryTypeText = `Тип получения: ${
        data.delMethod === "pickup" ? "Самовывоз" : "Доставка"
    }`;
    const addressText =
        data.delMethod === "delivery" ? `Адрес: ${data.address}` : "";
    const commentText =
        data.comment !== null ? `Комментарий к заказу: ${data.comment}` : "";
    const deliveryPriceText =
        data.delMethod === "delivery"
            ? `\nСтоимость доставки: ${data.deliveryPrice} ₽`
            : "";
    const cartPriceText =
        data.delMethod === "delivery"
            ? `Стоимость корзины: ${data.cartPrice} ₽`
            : "";
    const totalPriceText = `Цена к оплате: ${data.totalPrice} ₽`;

    // Собираем все части заказа в одну строку, пропуская пустые строки
    const orderTextParts = [
        phoneText,
        paymentMethodText,
        deliveryTypeText,
        addressText,
        commentText,
        deliveryPriceText,
        cartPriceText,
        totalPriceText,
    ].filter((part) => part !== "");

    // Склеиваем все части заказа, разделяя их переносом строки
    return orderTextParts.join("\n");
}
