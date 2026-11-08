"""Clearly synthetic, local multilingual demo conversations (no organizer data)."""

import json
from pathlib import Path

samples = {
    "RU": [
        (
            "Здравствуйте! Подскажите, где посмотреть тарифы?",
            "Здравствуйте! Меня зовут Алия. Действующие тарифы можно посмотреть на официальном сайте в разделе «Тарифы».",
            "Спасибо, нашёл.",
            "Рада помочь. Если появятся вопросы, обращайтесь. До свидания!",
        ),
        (
            "У меня не открывается приложение, это мешает работе.",
            "Здравствуйте, я Дана. Понимаю, что это неудобно. Какое сообщение об ошибке вы видите?",
            "Пишет «нет подключения».",
            "Проверьте подключение к сети и повторите вход. Если ошибка останется, передам запрос технической поддержке.",
            "Хорошо, попробую.",
            "Итак, сначала проверим сеть. Могу ещё чем-то помочь? До свидания!",
        ),
        (
            "Здравствуйте, хочу узнать, как обратиться в поддержку.",
            "Здравствуйте! Алия, служба поддержки. Напишите через раздел «Помощь» в приложении.",
            "Спасибо.",
            "Пожалуйста. До свидания!",
        ),
    ],
    "KZ": [
        (
            "Сәлеметсіз бе! Тарифтерді қайдан көруге болады?",
            "Сәлеметсіз бе! Менің атым Айдана. Қолданыстағы тарифтерді ресми сайттың «Тарифтер» бөлімінен көре аласыз.",
            "Рақмет, таптым.",
            "Көмектескеніме қуаныштымын. Қосымша сұрақтарыңыз бар ма? Сау болыңыз!",
        ),
        (
            "Қолданба ашылмайды, жұмыс істей алмай отырмын.",
            "Сәлеметсіз бе, мен Данамын. Бұл қолайсыздықты түсінемін. Қандай қате көрсетіліп тұр?",
            "Байланыс жоқ деп тұр.",
            "Интернет байланысын тексеріп, қайта кіріп көріңіз. Қате қайталанса, техникалық қолдауға сұрау жіберемін.",
            "Жақсы, байқап көремін.",
            "Алдымен желіні тексереміз. Тағы көмегім қажет пе? Сау болыңыз!",
        ),
        (
            "Қолдау қызметіне қалай жазуға болады?",
            "Сәлеметсіз бе! Мен Алия, қолдау маманымын. Қолданбадағы «Көмек» бөлімін ашыңыз.",
            "Рақмет.",
            "Оқасы жоқ. Сау болыңыз!",
        ),
    ],
    "EN": [
        (
            "Hello, where can I find the fee schedule?",
            "Hello! My name is Aliya. You can find the current fee schedule in the Fees section of the official website.",
            "Thanks, found it.",
            "Happy to help. Is there anything else I can help with? Goodbye!",
        ),
        (
            "The app will not open and I cannot get my work done.",
            "Hello, I am Dana. I understand that this is inconvenient. What error message do you see?",
            "It says no connection.",
            "Please check your network and try signing in again. If it persists, I can pass your request to technical support.",
            "Okay, I will try.",
            "We will start with the network check. Can I help with anything else? Goodbye!",
        ),
        (
            "How can I contact support?",
            "Hello! I am Aliya from support. Open the Help section in the app.",
            "Thank you.",
            "You are welcome. Goodbye!",
        ),
    ],
}
records = []
for lang, dialogs in samples.items():
    for index, texts in enumerate(dialogs):
        transcript = [
            {
                "timestamp": "00:00",
                "speaker": "system",
                "text": "SYNTHETIC DEMO · conversation opened",
            },
            {
                "timestamp": "00:01",
                "speaker": "bot",
                "text": "SYNTHETIC DEMO · connecting to an operator",
            },
        ]
        transcript += [
            {
                "timestamp": f"{i // 5:02d}:{(i * 11 + 2) % 60:02d}",
                "speaker": "client" if i % 2 == 0 else "operator",
                "text": t,
            }
            for i, t in enumerate(texts)
        ]
        transcript += [
            {
                "timestamp": "02:30",
                "speaker": "system",
                "text": "SYNTHETIC DEMO · conversation closed",
            }
        ]
        records.append(
            {
                "conversation_id": f"demo-{lang.lower()}-{index + 1:03d}",
                "language": lang,
                "channel": "agent chat",
                "audio_url": None,
                "transcript": transcript,
            }
        )
records.append(
    {
        "conversation_id": "demo-call-en-001",
        "language": "EN",
        "channel": "voice call",
        "audio_url": "https://example.invalid/synthetic-demo-recording.wav",
        "transcript": [
            {
                "timestamp": "2026-11-01T10:00:00+05:00",
                "speaker": "client",
                "text": "Synthetic call transcript: where can I find support?",
            },
            {
                "timestamp": "2026-11-01T10:00:04+05:00",
                "speaker": "operator",
                "text": "Hello, my name is Dana. Use the Help section in the app. Goodbye.",
            },
        ],
    }
)
Path("config/synthetic_demo.json").write_text(
    json.dumps(
        {
            "error": "",
            "isSuccess": True,
            "data": {
                "dataset_group_id": "SYNTHETIC_DEMO",
                "total_records": len(records),
                "records": records,
            },
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
